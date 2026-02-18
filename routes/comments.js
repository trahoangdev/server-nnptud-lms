/**
 * Comment routes — CRUD with socket notifications
 */

import express from "express";
import prisma from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import { getIO } from "../socket.js";
import { createNotification } from "./notifications.js";

const router = express.Router();

router.post("/comments", authenticateToken, async (req, res) => {
  try {
    const { content, assignmentId, submissionId } = req.body;
    if (!assignmentId && !submissionId) return res.status(400).json({ error: "Target required" });

    // If submissionId provided but no assignmentId, resolve it from the submission
    let resolvedAssignmentId = assignmentId ? Number(assignmentId) : null;
    if (submissionId && !resolvedAssignmentId) {
      const sub = await prisma.submission.findUnique({ where: { id: Number(submissionId) }, select: { assignmentId: true } });
      if (sub) resolvedAssignmentId = sub.assignmentId;
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.user.id,
        assignmentId: resolvedAssignmentId,
        submissionId: submissionId ? Number(submissionId) : null,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    try {
      const payload = {
        id: comment.id,
        content: comment.content,
        author_name: comment.user.name,
        author_id: comment.userId,
        created_at: comment.createdAt,
        assignmentId: assignmentId ? Number(assignmentId) : null,
        submissionId: submissionId ? Number(submissionId) : null,
      };
      const io = getIO();
      io.emit("comment:new", payload);
      if (submissionId) io.to(`submission:${submissionId}`).emit("comment:new", payload);
    } catch (e) {
      console.error("Socket error:", e.message);
    }

    // Notify relevant users about the comment
    try {
      if (submissionId) {
        // Get submission owner to notify
        const sub = await prisma.submission.findUnique({
          where: { id: Number(submissionId) },
          include: { assignment: { select: { title: true, classId: true, class: { select: { teacherId: true } } } } },
        });
        if (sub) {
          // Notify student if teacher commented, or teacher if student commented
          const recipientId = sub.studentId === req.user.id ? sub.assignment.class.teacherId : sub.studentId;
          if (recipientId && recipientId !== req.user.id) {
            createNotification({
              userId: recipientId,
              type: "comment",
              title: "Nhận xét mới",
              message: `${comment.user.name} đã nhận xét về bài '${sub.assignment.title}'`,
              link: sub.studentId === req.user.id
                ? `/assignments/${sub.assignmentId}`
                : `/student/assignments/${sub.assignmentId}`,
            });
          }
        }
      }
    } catch (e) {
      console.error("Comment notification error:", e.message);
    }

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/comments", authenticateToken, async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.query;
    const paginate = req.query.page !== undefined;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const take = Math.min(Number(req.query.limit) || 50, 100);

    const filter = {};
    if (assignmentId) filter.assignmentId = Number(assignmentId);
    if (submissionId) filter.submissionId = Number(submissionId);

    const findOpts = {
      where: filter,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    };
    if (paginate) {
      findOpts.skip = (page - 1) * take;
      findOpts.take = take;
    }

    const comments = await prisma.comment.findMany(findOpts);

    if (paginate) {
      const total = await prisma.comment.count({ where: filter });
      return res.json({ data: comments, total, page, limit: take });
    }
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Update comment: author or teacher of assignment's class or admin */
router.patch("/comments/:id", authenticateToken, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        assignment: { select: { classId: true, class: { select: { teacherId: true } } } },
        submission: { select: { assignmentId: true, assignment: { select: { classId: true, class: { select: { teacherId: true } } } } } },
      },
    });
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    const isAuthor = comment.userId === req.user.id;
    const teacherId = comment.assignment?.class?.teacherId ?? comment.submission?.assignment?.class?.teacherId;
    const isTeacher = teacherId === req.user.id;
    if (!isAuthor && !isTeacher && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "You can only edit your own comment or be the teacher" });
    }
    const { content } = req.body;
    if (typeof content !== "string" || !content.trim()) return res.status(400).json({ error: "content required" });
    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Delete comment: author or teacher of assignment's class or admin */
router.delete("/comments/:id", authenticateToken, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        assignment: { select: { classId: true, class: { select: { teacherId: true } } } },
        submission: { select: { assignmentId: true, assignment: { select: { classId: true, class: { select: { teacherId: true } } } } } },
      },
    });
    if (!comment) return res.status(404).json({ error: "Comment not found" });
    const isAuthor = comment.userId === req.user.id;
    const teacherId = comment.assignment?.class?.teacherId ?? comment.submission?.assignment?.class?.teacherId;
    const isTeacher = teacherId === req.user.id;
    if (!isAuthor && !isTeacher && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "You can only delete your own comment or be the teacher" });
    }
    await prisma.comment.delete({
      where: { id: commentId },
    });
    res.json({ message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
