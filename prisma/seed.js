/**
 * Seed data fake cho NNPTUD LMS.
 * Chạy: npx prisma db seed
 *
 * Tạo: Admin, Giáo viên, Học sinh (mật khẩu chung: password123)
 *       Lớp học, Bài tập, Bài nộp, Điểm, Bình luận
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "password123";

async function main() {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);

  // --- Users (upsert theo email để chạy lại seed không tạo trùng) ---
  const admin = await prisma.user.upsert({
    where: { email: "admin@nnptud.edu.vn" },
    update: {},
    create: {
      name: "Admin Nguyễn",
      email: "admin@nnptud.edu.vn",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@nnptud.edu.vn" },
    update: {},
    create: {
      name: "Thầy Trần Văn A",
      email: "teacher@nnptud.edu.vn",
      password: hashedPassword,
      role: "TEACHER",
    },
  });

  const student1 = await prisma.user.upsert({
    where: { email: "student@nnptud.edu.vn" },
    update: {},
    create: {
      name: "Sinh viên Lê B",
      email: "student@nnptud.edu.vn",
      password: hashedPassword,
      role: "STUDENT",
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: "student2@nnptud.edu.vn" },
    update: {},
    create: {
      name: "Sinh viên Phạm C",
      email: "student2@nnptud.edu.vn",
      password: hashedPassword,
      role: "STUDENT",
    },
  });

  console.log("✓ Users:", admin.email, teacher.email, student1.email, student2.email);

  // --- Classes (tạo mới mỗi lần hoặc bỏ qua nếu đã có) ---
  let class1 = await prisma.class.findFirst({ where: { name: "Toán cao cấp 1" } });
  if (!class1) {
    class1 = await prisma.class.create({
      data: {
        name: "Toán cao cấp 1",
        description: "Lớp toán cho năm nhất",
        teacherId: teacher.id,
      },
    });
  }
  let class2 = await prisma.class.findFirst({ where: { name: "Lập trình Web" } });
  if (!class2) {
    class2 = await prisma.class.create({
      data: {
        name: "Lập trình Web",
        description: "React, Node.js",
        teacherId: teacher.id,
      },
    });
  }

  // Ghi danh học sinh vào lớp
  await prisma.class.update({
    where: { id: class1.id },
    data: { students: { connect: [{ id: student1.id }, { id: student2.id }] } },
  });
  await prisma.class.update({
    where: { id: class2.id },
    data: { students: { connect: [{ id: student1.id }] } },
  });
  console.log("✓ Classes + enroll:", class1.name, class2.name);

  // --- Assignments ---
  const due1 = new Date();
  due1.setDate(due1.getDate() + 14);
  const due2 = new Date();
  due2.setDate(due2.getDate() + 21);

  let assign1 = await prisma.assignment.findFirst({
    where: { classId: class1.id, title: "Bài tập chương 1 - Giới hạn" },
  });
  if (!assign1) {
    assign1 = await prisma.assignment.create({
      data: {
        title: "Bài tập chương 1 - Giới hạn",
        description: "Làm bài 1-10 trang 45",
        fileUrl: null,
        dueDate: due1,
        classId: class1.id,
        createdById: teacher.id,
      },
    });
  }

  let assign2 = await prisma.assignment.findFirst({
    where: { classId: class1.id, title: "Bài tập chương 2 - Đạo hàm" },
  });
  if (!assign2) {
    assign2 = await prisma.assignment.create({
      data: {
        title: "Bài tập chương 2 - Đạo hàm",
        description: "Bài tập về đạo hàm cơ bản",
        fileUrl: null,
        dueDate: due2,
        classId: class1.id,
        createdById: teacher.id,
      },
    });
  }

  let assign3 = await prisma.assignment.findFirst({
    where: { classId: class2.id, title: "Đồ án giữa kỳ - Todo App" },
  });
  if (!assign3) {
    assign3 = await prisma.assignment.create({
      data: {
        title: "Đồ án giữa kỳ - Todo App",
        description: "Xây dựng ứng dụng Todo với React",
        fileUrl: null,
        dueDate: due2,
        classId: class2.id,
        createdById: teacher.id,
      },
    });
  }
  console.log("✓ Assignments:", assign1.title, assign2.title, assign3.title);

  // --- Submissions (chỉ tạo nếu chưa có bài nộp của student1 cho assign1) ---
  let sub1 = await prisma.submission.findFirst({
    where: { assignmentId: assign1.id, studentId: student1.id },
  });
  if (!sub1) {
    sub1 = await prisma.submission.create({
      data: {
        content: "Em đã làm xong bài 1-5, bài 6-10 em nộp bổ sung.",
        fileUrl: null,
        status: "SUBMITTED",
        assignmentId: assign1.id,
        studentId: student1.id,
      },
    });
  }

  let sub2 = await prisma.submission.findFirst({
    where: { assignmentId: assign1.id, studentId: student2.id },
  });
  if (!sub2) {
    sub2 = await prisma.submission.create({
      data: {
        content: null,
        fileUrl: null,
        status: "LATE",
        assignmentId: assign1.id,
        studentId: student2.id,
      },
    });
  }

  let sub3 = await prisma.submission.findFirst({
    where: { assignmentId: assign3.id, studentId: student1.id },
  });
  if (!sub3) {
    sub3 = await prisma.submission.create({
      data: {
        content: "Link repo: https://github.com/demo/todo-app",
        fileUrl: null,
        status: "SUBMITTED",
        assignmentId: assign3.id,
        studentId: student1.id,
      },
    });
  }
  console.log("✓ Submissions:", sub1.id, sub2.id, sub3.id);

  // --- Grades ---
  const gradeSub1 = await prisma.grade.findUnique({ where: { submissionId: sub1.id } });
  if (!gradeSub1) {
    await prisma.grade.create({
      data: {
        score: 8.5,
        submissionId: sub1.id,
        gradedById: teacher.id,
      },
    });
  }
  const gradeSub3 = await prisma.grade.findUnique({ where: { submissionId: sub3.id } });
  if (!gradeSub3) {
    await prisma.grade.create({
      data: {
        score: 9,
        submissionId: sub3.id,
        gradedById: teacher.id,
      },
    });
  }
  console.log("✓ Grades");

  // --- Comments (tạo 2 comment mẫu nếu chưa có) ---
  const existingComment = await prisma.comment.findFirst({
    where: { submissionId: sub1.id, content: "Bài làm tốt, cần bổ sung phần giới hạn một bên." },
  });
  if (!existingComment) {
    await prisma.comment.createMany({
      data: [
        {
          content: "Bài làm tốt, cần bổ sung phần giới hạn một bên.",
          userId: teacher.id,
          submissionId: sub1.id,
        },
        {
          content: "Em cảm ơn thầy, em sẽ bổ sung ạ.",
          userId: student1.id,
          submissionId: sub1.id,
        },
      ],
    });
  }
  console.log("✓ Comments");

  console.log("\n✅ Seed hoàn tất. Đăng nhập với mật khẩu:", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
