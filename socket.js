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

    // Client gửi: socket.emit("join_room", { userId: 1, role: "TEACHER" })
    socket.on("join_room", (data) => {
      const { userId, role } = data;
      if (!userId) return;

      // Join room theo ID riêng để nhận thông báo cá nhân
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room user_${userId}`);

      // Nếu là Teacher, join thêm room giáo viên (để nhận thông báo nộp bài)
      if (role === "TEACHER" || role === "ADMIN") {
        socket.join("teachers");
        console.log(`User ${userId} joined room teachers`);
      }
    });

    // Sự kiện: Chat/Comment (Demo)
    socket.on("send_comment", (data) => {
      // Broadcast cho tất cả mọi người trong cùng Assignment (cần logic room phức tạp hơn)
      io.emit("new_comment", data);
    });

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

// Hàm helper để gửi thông báo từ Controller (API)
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
