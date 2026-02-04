import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import prisma from "./db.js";
import dotenv from "dotenv";
import { getIO } from "./socket.js";
import { authenticateToken, authorizeRole } from "./middleware/auth.js";

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey123";

/** Generate unique 6-char class code (PRD: code unique, auto generate) */
function generateClassCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

async function ensureUniqueClassCode() {
  let code;
  let exists = true;
  while (exists) {
    code = generateClassCode();
    const c = await prisma.class.findUnique({ where: { code } });
    exists = !!c;
  }
  return code;
}

/* ================== CLOUDINARY CONFIG ================== */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const isImage = file.mimetype.startsWith("image/") && file.mimetype !== "application/pdf";
    const resource_type = isImage ? "image" : "raw";
    const name = file.originalname.split(".").slice(0, -1).join(".").replace(/[^a-zA-Z0-9]/g, "_");
    const ext = file.originalname.split(".").pop();
    const public_id =
      resource_type === "raw" ? `${Date.now()}-${name}.${ext}` : `${Date.now()}-${name}`;
    return {
      folder: "lms-uploads",
      resource_type,
      public_id,
    };
  },
});

const upload = multer({ storage });

/* ================== ROLE / ACCESS HELPERS (dùng sau middleware auth) ================== */

/** Teacher: class must be owned by req.user. Student: must be member. Admin: allow. */
async function checkClassAccess(req, classId, needOwner = false) {
  const id = Number(classId);
  const c = await prisma.class.findUnique({
    where: { id },
    include: {
      members: { where: { status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!c) return { ok: false, status: 404, message: "Class not found" };
  if (req.user.role === "ADMIN") return { ok: true, class: c };
  if (req.user.role === "TEACHER" && c.teacherId === req.user.id) {
    if (needOwner) return { ok: true, class: c };
    return { ok: true, class: c };
  }
  if (req.user.role === "STUDENT") {
    const member = c.members.find((m) => m.userId === req.user.id);
    if (member) return { ok: true, class: c };
  }
  return { ok: false, status: 403, message: "Access denied" };
}

/* ================== AUTH API (PRD §5.1) ================== */

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: role || "STUDENT", status: "ACTIVE" },
    });
    res.status(201).json({ message: "User created", userId: user.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({ error: "Email is required" });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password is required" });
    }
    const user = await prisma.user.findUnique({ where: { email: email.trim() } });
    if (!user) return res.status(400).json({ error: "Email hoặc mật khẩu không đúng" });
    if (user.status && user.status !== "ACTIVE") return res.status(403).json({ error: "Tài khoản đã bị khóa" });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: "Email hoặc mật khẩu không đúng" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================== PROFILE / ME API ================== */

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================== UPLOAD API (PRD §8) ================== */

router.post("/upload", authenticateToken, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      console.error("Multer/Cloudinary Error:", err);
      return res.status(500).json({ error: err.message || "File upload failed" });
    }
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ message: "File uploaded", fileUrl: req.file.path, filename: req.file.filename });
});

/* ================== CLASS API (PRD §4.2, §5.2) ================== */

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
    res.status(201).json(newClass);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/classes", authenticateToken, async (req, res) => {
  try {
    let where = { status: "ACTIVE" };
    if (req.user.role === "TEACHER") where.teacherId = req.user.id;
    if (req.user.role === "STUDENT") {
      where.members = { some: { userId: req.user.id, status: "ACTIVE" } };
    }
    if (req.user.role === "ADMIN") {
      // Admin xem tất cả lớp (có thể filter sau)
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { members: true, assignments: true } },
      },
    });
    // Format cho client: students count = members count
    const list = classes.map((c) => ({
      ...c,
      students: c._count.members,
      assignments: c._count.assignments,
      _count: undefined,
    }));
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
    await prisma.class.delete({
      where: { id: Number(req.params.id) },
    });
    res.json({ message: "Class deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================== ASSIGNMENT API (PRD §4.4, §5.3) ================== */

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

    const assignments = await prisma.assignment.findMany({
      where: { classId: Number(req.params.classId) },
      include: { _count: { select: { submissions: true } } },
      orderBy: { dueDate: "asc" },
    });
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

/* ================== SUBMISSION API (PRD §4.5, §5.4) ================== */

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

/* ================== GRADE API (PRD §4.6, §5.5) ================== */

router.post("/grades", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const { submissionId, score } = req.body;
    const submission = await prisma.submission.findUnique({
      where: { id: Number(submissionId) },
      include: { assignment: true },
    });
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const access = await checkClassAccess(req, submission.assignment.classId);
    if (!access.ok) return res.status(access.status).json({ error: access.message });

    const maxScore = submission.assignment.maxScore ?? 10;
    const numScore = parseFloat(score);
    if (numScore < 0 || numScore > maxScore) {
      return res.status(400).json({ error: `Score must be between 0 and ${maxScore}` });
    }

    const grade = await prisma.grade.upsert({
      where: { submissionId: Number(submissionId) },
      update: { score: numScore, gradedById: req.user.id, gradedAt: new Date() },
      create: {
        submissionId: Number(submissionId),
        score: numScore,
        gradedById: req.user.id,
      },
    });

    try {
      const io = getIO();
      io.to(`user_${submission.studentId}`).emit("grade:updated", {
        submission_id: submission.id,
        score: grade.score,
        graded_at: grade.gradedAt,
        assignment_title: submission.assignment.title,
      });
      io.to(`assignment:${submission.assignmentId}`).emit("grade:updated", {
        submission_id: submission.id,
        score: grade.score,
        student_id: submission.studentId,
      });
      io.to(`class:${submission.assignment.classId}`).emit("grade:updated", {
        submission_id: submission.id,
        score: grade.score,
        student_id: submission.studentId,
      });
    } catch (e) {
      console.error("Socket error:", e.message);
    }

    res.json(grade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================== COMMENT API (PRD §4.7, §6) ================== */

router.post("/comments", authenticateToken, async (req, res) => {
  try {
    const { content, assignmentId, submissionId } = req.body;
    if (!assignmentId && !submissionId) return res.status(400).json({ error: "Target required" });

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.user.id,
        assignmentId: assignmentId ? Number(assignmentId) : null,
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

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/comments", authenticateToken, async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.query;
    const filter = {};
    if (assignmentId) filter.assignmentId = Number(assignmentId);
    if (submissionId) filter.submissionId = Number(submissionId);

    const comments = await prisma.comment.findMany({
      where: filter,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });
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

/* ================== ADMIN API (PRD §3.1, §5.1, §7) ================== */

router.get("/admin/users", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const { role, status } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/admin/users", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, password required" });
    if (!["TEACHER", "STUDENT"].includes(role)) return res.status(400).json({ error: "role must be TEACHER or STUDENT" });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role, status: "ACTIVE" },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/admin/users/:id", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { status, name, email } = req.body;
    
    const updateData = {};
    if (status && ["ACTIVE", "INACTIVE"].includes(status)) {
      updateData.status = status;
    }
    if (name && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }
    if (email && typeof email === "string" && email.trim()) {
      // Check if email already exists for another user
      const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
      if (existing && existing.id !== userId) {
        return res.status(400).json({ error: "Email already exists" });
      }
      updateData.email = email.trim();
    }
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/admin/classes", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status && ["ACTIVE", "ARCHIVED"].includes(String(status))) where.status = status;
    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, assignments: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Admin stats for dashboard/reports */
router.get("/admin/stats", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const [totalUsers, totalTeachers, totalStudents, totalClasses, totalAssignments, activeUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "TEACHER" } }),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.class.count(),
      prisma.assignment.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
    ]);
    res.json({
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      totalAssignments,
      activeUsers,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Admin activity logs - synthetic from existing data */
router.get("/admin/activity-logs", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const { role, actionType, status, limit = 100, offset = 0 } = req.query;
    
    const logs = [];
    
    // Get recent user creations
    const recentUsers = await prisma.user.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    recentUsers.forEach((u) => {
      logs.push({
        id: `user-${u.id}`,
        timestamp: u.createdAt.toISOString(),
        userId: String(u.id),
        userName: u.name,
        userRole: u.role.toLowerCase(),
        action: "Tạo tài khoản mới",
        actionType: "create",
        resource: "User",
        resourceId: String(u.id),
        details: `Tài khoản ${u.email} được tạo`,
        ipAddress: "N/A",
        status: "success",
      });
    });
    
    // Get recent class creations
    const recentClasses = await prisma.class.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { teacher: { select: { id: true, name: true, role: true } } },
    });
    recentClasses.forEach((c) => {
      logs.push({
        id: `class-${c.id}`,
        timestamp: c.createdAt.toISOString(),
        userId: String(c.teacherId),
        userName: c.teacher.name,
        userRole: c.teacher.role.toLowerCase(),
        action: "Tạo lớp học mới",
        actionType: "create",
        resource: "Class",
        resourceId: String(c.id),
        details: `Lớp '${c.name}' được tạo thành công`,
        ipAddress: "N/A",
        status: "success",
      });
    });
    
    // Get recent assignments
    const recentAssignments = await prisma.assignment.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true, role: true } }, class: { select: { name: true } } },
    });
    recentAssignments.forEach((a) => {
      if (a.createdBy) {
        logs.push({
          id: `assign-${a.id}`,
          timestamp: a.createdAt.toISOString(),
          userId: String(a.createdById),
          userName: a.createdBy.name,
          userRole: a.createdBy.role.toLowerCase(),
          action: "Giao bài tập mới",
          actionType: "create",
          resource: "Assignment",
          resourceId: String(a.id),
          details: `Giao bài '${a.title}' cho lớp ${a.class.name}`,
          ipAddress: "N/A",
          status: "success",
        });
      }
    });
    
    // Get recent submissions
    const recentSubmissions = await prisma.submission.findMany({
      take: 20,
      orderBy: { submittedAt: "desc" },
      include: { student: { select: { id: true, name: true, role: true } }, assignment: { select: { title: true, class: { select: { name: true } } } } },
    });
    recentSubmissions.forEach((s) => {
      logs.push({
        id: `sub-${s.id}`,
        timestamp: s.submittedAt.toISOString(),
        userId: String(s.studentId),
        userName: s.student.name,
        userRole: s.student.role.toLowerCase(),
        action: "Nộp bài tập",
        actionType: "create",
        resource: "Submission",
        resourceId: String(s.id),
        details: `Nộp bài '${s.assignment.title}' cho lớp ${s.assignment.class.name}`,
        ipAddress: "N/A",
        status: s.status === "LATE_SUBMITTED" ? "warning" : "success",
      });
    });
    
    // Get recent grades
    const recentGrades = await prisma.grade.findMany({
      take: 20,
      orderBy: { gradedAt: "desc" },
      include: {
        gradedBy: { select: { id: true, name: true, role: true } },
        submission: {
          include: {
            student: { select: { name: true } },
            assignment: { select: { title: true } },
          },
        },
      },
    });
    recentGrades.forEach((g) => {
      if (g.gradedBy) {
        logs.push({
          id: `grade-${g.id}`,
          timestamp: g.gradedAt.toISOString(),
          userId: String(g.gradedById),
          userName: g.gradedBy.name,
          userRole: g.gradedBy.role.toLowerCase(),
          action: "Chấm điểm bài tập",
          actionType: "update",
          resource: "Grade",
          resourceId: String(g.id),
          details: `Chấm điểm ${g.score} cho bài nộp của học sinh ${g.submission.student.name}`,
          ipAddress: "N/A",
          status: "success",
        });
      }
    });
    
    // Sort by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply filters
    let filteredLogs = logs;
    if (role && role !== "all") {
      filteredLogs = filteredLogs.filter((log) => log.userRole === role.toLowerCase());
    }
    if (actionType && actionType !== "all") {
      filteredLogs = filteredLogs.filter((log) => log.actionType === actionType);
    }
    if (status && status !== "all") {
      filteredLogs = filteredLogs.filter((log) => log.status === status);
    }
    
    // Pagination
    const total = filteredLogs.length;
    const paginatedLogs = filteredLogs.slice(Number(offset), Number(offset) + Number(limit));
    
    res.json({
      logs: paginatedLogs,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Admin settings - simple key-value store simulation */
router.get("/admin/settings", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    // Return default settings (in real app, store in DB)
    res.json({
      system: {
        siteName: "NNPTUD LMS",
        siteUrl: process.env.SITE_URL || "https://lms.edu.vn",
        adminEmail: process.env.ADMIN_EMAIL || "admin@lms.edu.vn",
        maxFileSize: 50,
        maxStoragePerClass: 5,
        sessionTimeout: 30,
        maintenanceMode: false,
      },
      security: {
        twoFactorRequired: false,
        passwordMinLength: 8,
        passwordRequireUppercase: true,
        passwordRequireNumber: true,
        passwordRequireSpecial: false,
        maxLoginAttempts: 5,
        lockoutDuration: 15,
        sessionConcurrent: true,
      },
      email: {
        smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
        smtpPort: process.env.SMTP_PORT || "587",
        smtpUser: process.env.SMTP_USER || "",
        smtpSecure: "tls",
        fromName: "NNPTUD LMS",
        fromEmail: process.env.SMTP_FROM || "noreply@lms.edu.vn",
      },
      backup: {
        autoBackup: true,
        backupFrequency: "daily",
        backupRetention: 30,
        backupLocation: "local",
      },
      notifications: {
        notifyNewUser: true,
        notifyNewClass: true,
        notifyStorageWarning: true,
        notifySecurityAlert: true,
        dailyReport: false,
        weeklyReport: true,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/admin/settings", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const { system, security, email, backup, notifications } = req.body;
    // In real app, save to DB. For now, just return success
    res.json({ message: "Settings updated successfully", settings: { system, security, email, backup, notifications } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** Admin reports - submissions and grades statistics */
router.get("/admin/reports/submissions", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const { timeRange = "month" } = req.query;
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "quarter":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    const submissions = await prisma.submission.findMany({
      where: {
        submittedAt: { gte: startDate },
      },
      include: {
        assignment: { select: { dueDate: true, allowLate: true } },
      },
    });
    
    const stats = {
      total: submissions.length,
      onTime: submissions.filter((s) => {
        if (!s.assignment.dueDate) return true;
        return new Date(s.submittedAt) <= new Date(s.assignment.dueDate);
      }).length,
      late: submissions.filter((s) => s.status === "LATE_SUBMITTED").length,
      missing: 0, // Would need to calculate from assignments vs submissions
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/admin/reports/grades", authenticateToken, authorizeRole(["ADMIN"]), async (req, res) => {
  try {
    const grades = await prisma.grade.findMany({
      include: { submission: { select: { assignmentId: true } } },
    });
    
    const gradeRanges = {
      excellent: grades.filter((g) => g.score >= 9).length,
      good: grades.filter((g) => g.score >= 8 && g.score < 9).length,
      average: grades.filter((g) => g.score >= 6.5 && g.score < 8).length,
      belowAverage: grades.filter((g) => g.score >= 5 && g.score < 6.5).length,
      poor: grades.filter((g) => g.score < 5).length,
    };
    
    const total = grades.length;
    const avgScore = total > 0 ? grades.reduce((sum, g) => sum + g.score, 0) / total : 0;
    
    res.json({
      distribution: gradeRanges,
      total,
      average: avgScore,
      percentages: {
        excellent: total > 0 ? (gradeRanges.excellent / total) * 100 : 0,
        good: total > 0 ? (gradeRanges.good / total) * 100 : 0,
        average: total > 0 ? (gradeRanges.average / total) * 100 : 0,
        belowAverage: total > 0 ? (gradeRanges.belowAverage / total) * 100 : 0,
        poor: total > 0 ? (gradeRanges.poor / total) * 100 : 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
