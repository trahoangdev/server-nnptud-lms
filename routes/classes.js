/**
 * Class routes — CRUD, join by code, enroll student
 */

import express from "express";
import prisma from "../db.js";
import { authenticateToken, authorizeRole } from "../middleware/auth.js";
import { checkClassAccess, ensureUniqueClassCode, logActivity, getClientIP } from "./_helpers.js";

const router = express.Router();

router.post("/classes", authenticateToken, authorizeRole(["ADMIN", "TEACHER"]), async (req, res) => {
  try {
    const { name, description } = req.body;
    const teacherId = req.user.role === "TEACHER" ? req.user.id : req.body.teacherId;
    if (!teacherId) return res.status(400).json({ error: "teacherId required for Admin" });

    const code = await ensureUniqueClassCode();
    const newClass = await prisma.class.create({
      data: { name, description: description || null, code, teacherId: Number(teacherId), status: "ACTIVE" },
      include: { teacher: { select: { id: true, name: true } } },
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role.toLowerCase(),
      action: "Tạo lớp học mới",
      actionType: "create",
      resource: "Class",
      resourceId: newClass.id,
      details: `Lớp '${name}' được tạo thành công (Mã: ${code})`,
      ipAddress: getClientIP(req),
    });

    res.status(201).json(newClass);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/classes", authenticateToken, async (req, res) => {
  try {
    const paginate = req.query.page !== undefined;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const take = Math.min(Number(req.query.limit) || 50, 100);
    const skip = paginate ? (page - 1) * take : undefined;

    let where = { status: "ACTIVE" };
    if (req.user.role === "TEACHER") where.teacherId = req.user.id;
    if (req.user.role === "STUDENT") {
      where.members = { some: { userId: req.user.id, status: "ACTIVE" } };
    }

    const findOpts = {
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { members: true, assignments: true } },
      },
      orderBy: { updatedAt: "desc" },
    };
    if (paginate) {
      findOpts.skip = skip;
      findOpts.take = take;
    }

    const classes = await prisma.class.findMany(findOpts);
    const list = classes.map((c) => ({
      ...c,
      students: c._count.members,
      assignments: c._count.assignments,
      _count: undefined,
    }));

    if (paginate) {
      const total = await prisma.class.count({ where });
      return res.json({ data: list, total, page, limit: take });
    }
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/classes/:id", authenticateToken, async (req, res) => {
  try {
    const access = await checkClassAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    const classItem = await prisma.class.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        members: { where: { status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } } } },
        assignments: true,
      },
    });
    if (!classItem) return res.status(404).json({ error: "Class not found" });
    const out = {
      ...classItem,
      students: classItem.members.length,
    };
    res.json(out);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Join class by class code (PRD: Student join bằng code) */
router.post("/classes/join", authenticateToken, authorizeRole(["STUDENT"]), async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code required" });

    const classRow = await prisma.class.findFirst({ where: { code: String(code).trim().toUpperCase(), status: "ACTIVE" } });
    if (!classRow) return res.status(404).json({ error: "Invalid or expired class code" });

    const existing = await prisma.classMember.findUnique({
      where: { classId_userId: { classId: classRow.id, userId: req.user.id } },
    });
    if (existing) {
      if (existing.status === "ACTIVE") return res.status(400).json({ error: "Already in this class" });
      await prisma.classMember.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
    } else {
      await prisma.classMember.create({
        data: { classId: classRow.id, userId: req.user.id, status: "ACTIVE" },
      });
    }
    res.json({ message: "Joined successfully", classId: classRow.id, className: classRow.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/classes/:id/enroll", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    let studentId = req.user.id;
    if (req.user.role === "TEACHER" || req.user.role === "ADMIN") {
      if (!req.body.studentId) return res.status(400).json({ error: "Provide studentId" });
      studentId = req.body.studentId;
    }
    const classId = Number(req.params.id);
    const access = await checkClassAccess(req, classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });
    if (access.class.teacherId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Only teacher or admin can add students" });
    }

    await prisma.classMember.upsert({
      where: { classId_userId: { classId, userId: Number(studentId) } },
      update: { status: "ACTIVE" },
      create: { classId, userId: Number(studentId), status: "ACTIVE" },
    });
    res.json({ message: "Enrolled successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/classes/:id", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const access = await checkClassAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.message });
    const { name, description, status } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (status !== undefined && ["ACTIVE", "ARCHIVED"].includes(status)) data.status = status;

    const updated = await prisma.class.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/classes/:id", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const access = await checkClassAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    // Soft delete: archive thay vì xóa vĩnh viễn
    const archived = await prisma.class.update({
      where: { id: Number(req.params.id) },
      data: { status: "ARCHIVED" },
    });

    await logActivity({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role.toLowerCase(),
      action: "Xóa (lưu trữ) lớp học",
      actionType: "delete",
      resource: "Class",
      resourceId: req.params.id,
      details: `Lớp '${archived.name}' đã được lưu trữ (archived)`,
      ipAddress: getClientIP(req),
    });

    res.json({ message: "Class archived", class: archived });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
