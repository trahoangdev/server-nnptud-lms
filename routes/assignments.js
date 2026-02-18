/**
 * Assignment routes — CRUD + student assignments list
 */

import express from "express";
import prisma from "../db.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { checkClassAccess, logActivity, getClientIP } from "./_helpers.js";

const router = express.Router();

router.post("/assignments", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const { title, description, dueDate, classId, fileUrl, startTime, allowLate, maxScore } = req.body;
    const access = await checkClassAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description: description || null,
        fileUrl: fileUrl || null,
        startTime: startTime ? new Date(startTime) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        allowLate: allowLate === true,
        maxScore: maxScore != null ? Math.max(0, parseInt(maxScore, 10) || 10) : 10,
        classId: Number(classId),
        createdById: req.user.id,
      },
      include: { class: { select: { id: true, name: true } } },
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role.toLowerCase(),
      action: "Giao bài tập mới",
      actionType: "create",
      resource: "Assignment",
      resourceId: assignment.id,
      details: `Giao bài '${title}' cho lớp ${assignment.class.name}`,
      ipAddress: getClientIP(req),
    });

    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/assignments/:id", authenticateToken, async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: Number(req.params.id) },
      include: { class: { select: { id: true, name: true, teacherId: true } } },
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    if (req.user.role === "STUDENT") {
      const member = await prisma.classMember.findFirst({
        where: { classId: assignment.classId, userId: req.user.id, status: "ACTIVE" },
      });
      if (!member) return res.status(403).json({ error: "Not in this class" });
    } else if (req.user.role === "TEACHER" && assignment.class.teacherId !== req.user.id) {
      return res.status(403).json({ error: "Not your class" });
    }

    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/assignments/:id", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { class: true },
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const access = await checkClassAccess(req, assignment.classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    const { title, description, dueDate, fileUrl, startTime, allowLate, maxScore } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description || null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (fileUrl !== undefined) data.fileUrl = fileUrl || null;
    if (startTime !== undefined) data.startTime = startTime ? new Date(startTime) : null;
    if (allowLate !== undefined) data.allowLate = allowLate === true;
    if (maxScore !== undefined) data.maxScore = Math.max(0, parseInt(maxScore, 10) || 10);

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data,
      include: { class: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/classes/:classId/assignments", authenticateToken, async (req, res) => {
  try {
    const access = await checkClassAccess(req, req.params.classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    const paginate = req.query.page !== undefined;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const take = Math.min(Number(req.query.limit) || 50, 100);

    const findOpts = {
      where: { classId: Number(req.params.classId) },
      include: { _count: { select: { submissions: true } } },
      orderBy: { dueDate: "asc" },
    };
    if (paginate) {
      findOpts.skip = (page - 1) * take;
      findOpts.take = take;
    }

    const assignments = await prisma.assignment.findMany(findOpts);

    if (paginate) {
      const total = await prisma.assignment.count({ where: findOpts.where });
      return res.json({ data: assignments, total, page, limit: take });
    }
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/assignments/:id", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const assignmentId = Number(req.params.id);
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { class: true },
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    const access = await checkClassAccess(req, assignment.classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });
    await prisma.assignment.delete({
      where: { id: assignmentId },
    });
    res.json({ message: "Assignment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Student: all my assignments (from enrolled classes) with my submission status */
router.get("/student/assignments", authenticateToken, authorizeRole(["STUDENT"]), async (req, res) => {
  try {
    const memberships = await prisma.classMember.findMany({
      where: { userId: req.user.id, status: "ACTIVE" },
      select: { classId: true },
    });
    const classIds = memberships.map((m) => m.classId);
    if (classIds.length === 0) return res.json([]);

    const assignments = await prisma.assignment.findMany({
      where: { classId: { in: classIds } },
      include: {
        class: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    const submissionMap = {};
    const subs = await prisma.submission.findMany({
      where: {
        assignmentId: { in: assignments.map((a) => a.id) },
        studentId: req.user.id,
      },
      include: { grade: true },
    });
    subs.forEach((s) => {
      submissionMap[s.assignmentId] = s;
    });

    const result = assignments.map((a) => {
      const sub = submissionMap[a.id];
      return {
        assignment: {
          id: a.id,
          title: a.title,
          description: a.description,
          fileUrl: a.fileUrl,
          dueDate: a.dueDate,
          allowLate: a.allowLate,
          maxScore: a.maxScore ?? 10,
          classId: a.classId,
        },
        class: a.class,
        mySubmission: sub
          ? {
              id: sub.id,
              assignmentId: sub.assignmentId,
              studentId: sub.studentId,
              fileUrl: sub.fileUrl,
              content: sub.content,
              submittedAt: sub.submittedAt,
              lastUpdatedAt: sub.lastUpdatedAt,
              status: sub.status,
              grade: sub.grade
                ? {
                    id: sub.grade.id,
                    score: Number(sub.grade.score),
                    gradedAt: sub.grade.gradedAt instanceof Date ? sub.grade.gradedAt.toISOString() : sub.grade.gradedAt,
                  }
                : null,
            }
          : null,
      };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
