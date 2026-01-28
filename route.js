import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import prisma from "./db.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey123";

/* ================== CLOUDINARY CONFIG ================== */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cấu hình Multer storage dùng Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "lms-uploads", // Tên thư mục trên Cloudinary
    resource_type: "auto", // Tự động nhận diện (image, video, raw)
    allowed_formats: ["jpg", "png", "jpeg", "pdf", "zip", "docx", "doc", "pptx", "ppt", "xlsx", "xls", "txt"], // Định dạng cho phép
    public_id: (req, file) => Date.now() + "-" + file.originalname.split('.')[0], // Đặt tên file
  },
});

const upload = multer({ storage });

/* ================== MIDDLEWARE: AUTH & AUTHORIZATION ================== */

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access Token Required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid Token" });
    req.user = user;
    next();
  });
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access Denied: You do not have permission" });
    }
    next();
  };
};

/* ================== AUTH API ================== */

// Đăng ký
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "STUDENT",
      },
    });

    res.status(201).json({ message: "User created", userId: user.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Đăng nhập
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return res.status(400).json({ error: "User not found" });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================== FILE UPLOAD API (CLOUDINARY) ================== */

router.post("/upload", authenticateToken, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  // Với CloudinaryStorage, req.file.path chính là URL trên cloud
  res.json({ 
    message: "File uploaded to Cloudinary", 
    fileUrl: req.file.path,
    filename: req.file.filename 
  });
});

/* ================== CLASS API ================== */

router.post("/classes", authenticateToken, authorizeRole(["ADMIN", "TEACHER"]), async (req, res) => {
  try {
    const { name, description } = req.body;
    const teacherId = req.user.role === "TEACHER" ? req.user.id : req.body.teacherId;

    const newClass = await prisma.class.create({
      data: { name, description, teacherId: Number(teacherId) },
    });
    res.status(201).json(newClass);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/classes", authenticateToken, async (req, res) => {
  try {
    const where = {};
    if (req.user.role === "TEACHER") where.teacherId = req.user.id;
    if (req.user.role === "STUDENT") {
       where.students = { some: { id: req.user.id } };
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        teacher: { select: { name: true } },
        _count: { select: { students: true } },
      },
    });
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/classes/:id", authenticateToken, async (req, res) => {
  try {
    const classItem = await prisma.class.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        teacher: { select: { name: true } },
        assignments: true,
      }
    });
    res.json(classItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/classes/:id/enroll", authenticateToken, async (req, res) => {
  try {
    let studentId = req.user.id;
    if (req.user.role === "TEACHER" || req.user.role === "ADMIN") {
        if (!req.body.studentId) return res.status(400).json({error: "Provide studentId"});
        studentId = req.body.studentId;
    }

    await prisma.class.update({
      where: { id: Number(req.params.id) },
      data: { students: { connect: { id: Number(studentId) } } },
    });
    res.json({ message: "Enrolled successfully" });
  } catch (error) {
    res.status(500).json({ error: "Enrollment failed" });
  }
});

/* ================== ASSIGNMENT API ================== */

router.post("/assignments", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const { title, description, dueDate, classId, fileUrl } = req.body;
    
    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        fileUrl, // URL từ Cloudinary
        dueDate: dueDate ? new Date(dueDate) : null,
        classId: Number(classId),
        createdById: req.user.id,
      },
    });
    res.status(201).json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/assignments/:id", authenticateToken, async (req, res) => {
    try {
        const assignment = await prisma.assignment.findUnique({
             where: { id: Number(req.params.id) }
        });
        res.json(assignment);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/* ================== SUBMISSION API ================== */

router.post("/submissions", authenticateToken, authorizeRole(["STUDENT"]), async (req, res) => {
  try {
    const { content, fileUrl, assignmentId } = req.body;
    
    const assignment = await prisma.assignment.findUnique({ where: { id: Number(assignmentId) } });
    let status = "SUBMITTED";
    if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) status = "LATE";

    const submission = await prisma.submission.create({
      data: {
        content,
        fileUrl, // URL từ Cloudinary
        assignmentId: Number(assignmentId),
        studentId: req.user.id,
        status,
      },
    });
    res.status(201).json(submission);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/assignments/:assignmentId/submissions", authenticateToken, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    let filter = { assignmentId: Number(assignmentId) };

    if (req.user.role === "STUDENT") {
        filter.studentId = req.user.id;
    } 

    const submissions = await prisma.submission.findMany({
      where: filter,
      include: {
        student: { select: { name: true, email: true } },
        grade: true,
      },
    });
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================== GRADE API ================== */

router.post("/grades", authenticateToken, authorizeRole(["TEACHER", "ADMIN"]), async (req, res) => {
  try {
    const { submissionId, score } = req.body;

    const grade = await prisma.grade.upsert({
      where: { submissionId: Number(submissionId) },
      update: { score: parseFloat(score), gradedById: req.user.id, gradedAt: new Date() },
      create: {
        submissionId: Number(submissionId),
        score: parseFloat(score),
        gradedById: req.user.id,
      },
    });
    res.json(grade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
