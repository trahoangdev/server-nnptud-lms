/**
 * Socket.io - PRD §6 Realtime & Socket
 * Namespace: / (default) hoặc /lms
 * Rooms: class:{class_id}, assignment:{assignment_id}, submission:{submission_id}, user_{user_id}, teachers
 */

import { Server } from "socket.io";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`⚡ Client connected: ${socket.id}`);

    /**
     * Client gửi: socket.emit("join_room", { userId, role, classId?, assignmentId?, submissionId? })
     * - user_{userId}: thông báo cá nhân (grade, comment)
     * - teachers: giáo viên nhận submission:new
     * - class:{classId}: event liên quan lớp (submission, grade)
     * - assignment:{assignmentId}: event liên quan bài tập
     * - submission:{submissionId}: comment realtime trên bài nộp
     */
    socket.on("join_room", (data) => {
      const { userId, role, classId, assignmentId, submissionId } = data || {};
      if (!userId) return;

      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room user_${userId}`);

      if (role === "TEACHER" || role === "ADMIN") {
        socket.join("teachers");
      }
      if (classId) {
        socket.join(`class:${classId}`);
      }
      if (assignmentId) {
        socket.join(`assignment:${assignmentId}`);
      }
      if (submissionId) {
        socket.join(`submission:${submissionId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
