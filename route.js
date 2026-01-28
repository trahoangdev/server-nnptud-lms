import express from "express";
import prisma from "./db.js";

const router = express.Router();

/* ================== CLASS API ================== */
// Tạo lớp mới
router.post("/classes", async (req, res) => {
  // Ví dụ: const newClass = await prisma.class.create({ data: req.body });
});

// Lấy danh sách lớp
router.get("/classes", async (req, res) => {
  // const classes = await prisma.class.findMany();
});

// Lấy chi tiết một lớp
router.get("/classes/:id", async (req, res) => {});

// Cập nhật thông tin lớp
router.put("/classes/:id", async (req, res) => {});

// Xóa lớp
router.delete("/classes/:id", async (req, res) => {});

// Thêm học sinh vào lớp (Quan hệ Many-to-Many)
router.post("/classes/:id/enroll", async (req, res) => {});

/* ================== ASSIGNMENT API ================== */
// Tạo bài tập mới
router.post("/assignments", async (req, res) => {});

// Lấy danh sách bài tập của một lớp
router.get("/classes/:classId/assignments", async (req, res) => {});

// Lấy chi tiết bài tập
router.get("/assignments/:id", async (req, res) => {});

// Cập nhật bài tập
router.put("/assignments/:id", async (req, res) => {});

// Xóa bài tập
router.delete("/assignments/:id", async (req, res) => {});

/* ================== SUBMISSION API ================== */
// Nộp bài (Học sinh)
router.post("/submissions", async (req, res) => {});

// Xem danh sách bài nộp của một bài tập (Giáo viên)
router.get("/assignments/:assignmentId/submissions", async (req, res) => {});

// Xem chi tiết một bài nộp cụ thể
router.get("/submissions/:id", async (req, res) => {});

/* ================== GRADE API ================== */
// Chấm điểm
router.post("/grades", async (req, res) => {});

// Cập nhật điểm
router.put("/grades/:id", async (req, res) => {});

// Xem điểm của một bài nộp
router.get("/submissions/:submissionId/grade", async (req, res) => {});

/* ================== COMMENT API ================== */
// Viết bình luận
router.post("/comments", async (req, res) => {});

// Lấy danh sách bình luận (theo assignment hoặc submission)
router.get("/comments", async (req, res) => {});

// Xóa bình luận
router.delete("/comments/:id", async (req, res) => {});

export default router;
