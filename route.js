import express from "express";
import prisma from "./db.js";

const router = express.Router();

/* ============================================================
   CLASS API
   ============================================================ */

// 1. Tạo lớp mới
router.post("/classes", async (req, res) => {
  try {
    const { name, description, teacherId } = req.body;
    
    // Validate teacher
    const teacher = await prisma.user.findUnique({ where: { id: Number(teacherId) } });
    if (!teacher || (teacher.role !== "TEACHER" && teacher.role !== "ADMIN")) {
      return res.status(400).json({ error: "Invalid Teacher ID or User is not a Teacher" });
    }

    const newClass = await prisma.class.create({
      data: {
        name,
        description,
        teacherId: Number(teacherId),
      },
    });
    res.status(201).json(newClass);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Lấy danh sách lớp
router.get("/classes", async (req, res) => {
  try {
    const { teacherId } = req.query;
    const filter = teacherId ? { teacherId: Number(teacherId) } : {};

    const classes = await prisma.class.findMany({
      where: filter,
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { students: true } },
      },
    });
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Lấy chi tiết một lớp
router.get("/classes/:id", async (req, res) => {
  try {
    const classItem = await prisma.class.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        teacher: { select: { name: true, email: true } },
        students: { select: { id: true, name: true, email: true } },
        assignments: true,
      },
    });
    if (!classItem) return res.status(404).json({ error: "Class not found" });
    res.json(classItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Cập nhật thông tin lớp
router.put("/classes/:id", async (req, res) => {
  try {
    const { name, description } = req.body;
    const updatedClass = await prisma.class.update({
      where: { id: Number(req.params.id) },
      data: { name, description },
    });
    res.json(updatedClass);
  } catch (error) {
    res.status(500).json({ error: "Update failed or Class not found" });
  }
});

// 5. Xóa lớp
router.delete("/classes/:id", async (req, res) => {
  try {
    await prisma.class.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Class deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// 6. Thêm học sinh vào lớp (Enroll)
router.post("/classes/:id/enroll", async (req, res) => {
  try {
    const { studentId } = req.body;
    const classId = Number(req.params.id);

    // Validate student exists
    const student = await prisma.user.findUnique({ where: { id: Number(studentId) } });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const updatedClass = await prisma.class.update({
      where: { id: classId },
      data: {
        students: {
          connect: { id: Number(studentId) },
        },
      },
      include: { students: true },
    });
    res.json(updatedClass);
  } catch (error) {
    res.status(500).json({ error: "Enrollment failed" });
  }
});

/* ============================================================
   ASSIGNMENT API
   ============================================================ */

// 7. Tạo bài tập mới
router.post("/assignments", async (req, res) => {
  try {
    const { title, description, dueDate, classId, createdById } = req.body;
    
    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        classId: Number(classId),
        createdById: Number(createdById),
      },
    });
    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Lấy danh sách bài tập của một lớp
router.get("/classes/:classId/assignments", async (req, res) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { classId: Number(req.params.classId) },
      include: {
        createdBy: { select: { name: true } },
      },
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Lấy chi tiết bài tập
router.get("/assignments/:id", async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        submissions: {
          select: { id: true, studentId: true, status: true, submittedAt: true }
        }
      }
    });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Cập nhật bài tập
router.put("/assignments/:id", async (req, res) => {
    try {
        const { title, description, dueDate } = req.body;
        const updated = await prisma.assignment.update({
            where: { id: Number(req.params.id) },
            data: { 
                title, 
                description, 
                dueDate: dueDate ? new Date(dueDate) : undefined 
            }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 11. Xóa bài tập
router.delete("/assignments/:id", async (req, res) => {
  try {
    await prisma.assignment.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: "Assignment deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   SUBMISSION API
   ============================================================ */

// 12. Nộp bài (Học sinh)
router.post("/submissions", async (req, res) => {
  try {
    const { content, fileUrl, assignmentId, studentId } = req.body;

    // Check duplicate
    const existing = await prisma.submission.findFirst({
      where: {
        assignmentId: Number(assignmentId),
        studentId: Number(studentId),
      },
    });

    if (existing) {
      return res.status(400).json({ error: "You have already submitted this assignment." });
    }

    // Check late
    const assignment = await prisma.assignment.findUnique({ 
        where: { id: Number(assignmentId) } 
    });
    
    let status = "SUBMITTED";
    if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
        status = "LATE";
    }

    const submission = await prisma.submission.create({
      data: {
        content,
        fileUrl,
        assignmentId: Number(assignmentId),
        studentId: Number(studentId),
        status,
      },
    });
    res.status(201).json(submission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 13. Xem danh sách bài nộp của một bài tập (Giáo viên)
router.get("/assignments/:assignmentId/submissions", async (req, res) => {
  try {
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: Number(req.params.assignmentId) },
      include: {
        student: { select: { id: true, name: true, email: true } },
        grade: true,
      },
    });
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 14. Xem chi tiết một bài nộp cụ thể
router.get("/submissions/:id", async (req, res) => {
    try {
        const sub = await prisma.submission.findUnique({
            where: { id: Number(req.params.id) },
            include: { grade: true, comments: true }
        });
        res.json(sub);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* ============================================================
   GRADE API
   ============================================================ */

// 15. Chấm điểm
router.post("/grades", async (req, res) => {
  try {
    const { submissionId, score, gradedById } = req.body;

    const grade = await prisma.grade.upsert({
      where: { submissionId: Number(submissionId) },
      update: { 
        score: parseFloat(score),
        gradedById: Number(gradedById),
        gradedAt: new Date()
      },
      create: {
        submissionId: Number(submissionId),
        score: parseFloat(score),
        gradedById: Number(gradedById),
      },
    });

    res.json(grade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 16. Cập nhật điểm
router.put("/grades/:id", async (req, res) => {
    try {
        const { score } = req.body;
        const updated = await prisma.grade.update({
            where: { id: Number(req.params.id) },
            data: { score: parseFloat(score) }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 17. Xem điểm của một bài nộp
router.get("/submissions/:submissionId/grade", async (req, res) => {
  try {
    const grade = await prisma.grade.findUnique({
      where: { submissionId: Number(req.params.submissionId) },
    });
    res.json(grade || { message: "Not graded yet" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ============================================================
   COMMENT API
   ============================================================ */

// 18. Viết bình luận
router.post("/comments", async (req, res) => {
  try {
    const { content, userId, assignmentId, submissionId } = req.body;

    if (!assignmentId && !submissionId) {
        return res.status(400).json({ error: "Comment must belong to Assignment or Submission" });
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        userId: Number(userId),
        assignmentId: assignmentId ? Number(assignmentId) : null,
        submissionId: submissionId ? Number(submissionId) : null,
      },
    });
    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 19. Lấy danh sách bình luận (theo assignment hoặc submission)
router.get("/comments", async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.query;
    const filter = {};
    if (assignmentId) filter.assignmentId = Number(assignmentId);
    if (submissionId) filter.submissionId = Number(submissionId);

    const comments = await prisma.comment.findMany({
      where: filter,
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 20. Xóa bình luận
router.delete("/comments/:id", async (req, res) => {
    try {
        await prisma.comment.delete({ where: { id: Number(req.params.id) } });
        res.json({ message: "Comment deleted" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
