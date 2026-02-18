/**
 * Submission routes — create/upsert, list by assignment
 */

import express from "express";
import prisma from "../db.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { checkClassAccess, logActivity, getClientIP } from "./_helpers.js";
import { getIO } from "../socket.js";

const router = express.Router();

router.post("/submissions", authenticateToken, authorizeRole(["STUDENT"]), async (req, res) => {
  try {
    const { content, fileUrl, assignmentId } = req.body;
    const assignment = await prisma.assignment.findUnique({
      where: { id: Number(assignmentId) },
      include: { class: true },
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const member = await prisma.classMember.findFirst({
      where: { classId: assignment.classId, userId: req.user.id, status: "ACTIVE" },
    });
    if (!member) return res.status(403).json({ error: "Not in this class" });

    const now = new Date();
    const due = assignment.dueDate ? new Date(assignment.dueDate) : null;
    let status = "SUBMITTED";
    if (due && now > due) {
      if (!assignment.allowLate) {
        return res.status(400).json({ error: "Deadline passed. Late submission not allowed." });
      }
      status = "LATE_SUBMITTED";
    }

    const submission = await prisma.submission.upsert({
      where: {
        assignmentId_studentId: { assignmentId: Number(assignmentId), studentId: req.user.id },
      },
      update: {
        content: content ?? undefined,
        fileUrl: fileUrl ?? undefined,
        status,
        lastUpdatedAt: now,
        submittedAt: now,
      },
      create: {
        content: content || null,
        fileUrl: fileUrl || null,
        assignmentId: Number(assignmentId),
        studentId: req.user.id,
        status,
        lastUpdatedAt: now,
      },
      include: { student: { select: { id: true, name: true, email: true } }, grade: true },
    });

    try {
      const io = getIO();
      io.to(`class:${assignment.classId}`).emit("submission:new", {
        assignment_id: assignment.id,
        submission_id: submission.id,
        student_id: submission.studentId,
        submitted_at: submission.submittedAt,
        status,
      });
      io.to(`assignment:${assignment.id}`).emit("submission:updated", { submission_id: submission.id, status });
    } catch (e) {
      console.error("Socket error:", e.message);
    }

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: "student",
      action: "Nộp bài tập",
      actionType: "create",
      resource: "Submission",
      resourceId: submission.id,
      details: `Nộp bài '${assignment.title}' cho lớp ${assignment.class.name}`,
      ipAddress: getClientIP(req),
      status: status === "LATE_SUBMITTED" ? "warning" : "success",
    });

    res.status(201).json(submission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/assignments/:assignmentId/submissions", authenticateToken, async (req, res) => {
  try {
    const assignmentId = Number(req.params.assignmentId);
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { class: true },
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    if (req.user.role === "STUDENT") {
      const subs = await prisma.submission.findMany({
        where: { assignmentId, studentId: req.user.id },
        include: { grade: true },
      });
      return res.json(subs);
    }

    const access = await checkClassAccess(req, assignment.classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      include: { student: { select: { id: true, name: true, email: true } }, grade: true },
    });
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
