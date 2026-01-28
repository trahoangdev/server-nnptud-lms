import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http"; // Import HTTP Server
import router from "./route.js";
import prisma from "./db.js";
import { initSocket } from "./socket.js"; // Import Socket config

// Load biến môi trường
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app); // Tạo HTTP Server bọc Express
const PORT = process.env.PORT || 3000;

// Khởi tạo Socket.io
initSocket(httpServer);

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'uploads' directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ================== ROUTES ==================
app.use("/api", router);

app.get("/", (req, res) => {
  res.send("Server NNPTUD LMS (Prisma + PostgreSQL + Cloudinary + Socket.io) is running...");
});

// ================== SERVER START ==================
const startServer = async () => {
  try {
    // Kiểm tra kết nối database
    await prisma.$connect();
    console.log("✅ Connected to Database via Prisma");

    // Dùng httpServer.listen thay vì app.listen
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`👉 API Endpoint: http://localhost:${PORT}/api`);
      console.log(`⚡ Socket.io ready`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to database:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

startServer();
