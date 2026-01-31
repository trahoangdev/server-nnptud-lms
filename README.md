# NNPTUD LMS Server

Backend Server cho hệ thống Quản lý học tập (LMS), hỗ trợ Giáo viên quản lý lớp học, giao bài tập và Học sinh nộp bài.

## 🚀 Tính năng

- **Authentication**: Đăng ký/Đăng nhập (JWT), mã hóa mật khẩu.
- **Phân quyền (RBAC)**: 
  - **Admin/Teacher**: Quản lý lớp, tạo bài tập, chấm điểm.
  - **Student**: Xem lớp, nộp bài, xem điểm.
- **Quản lý Lớp học**: Tạo lớp, thêm học sinh.
- **Bài tập & Nộp bài**: 
  - Upload file đề bài (Teacher).
  - Upload bài làm (Student) hỗ trợ: PDF, DOCX, ZIP, Image...
  - Lưu trữ file trên **Cloudinary**.
- **Chấm điểm & Bình luận**: Giáo viên chấm điểm, hai bên trao đổi qua bình luận.

## 🛠 Công nghệ sử dụng

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Storage**: Cloudinary (File Upload)
- **Auth**: JWT & Bcrypt

## 📦 Cài đặt & Chạy dự án

### 1. Clone dự án
```bash
git clone https://github.com/trahoangdev/server-nnptud-lms.git
cd server-nnptud-lms
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình biến môi trường
Tạo file `.env` từ file mẫu:
```bash
cp .env.example .env
```
Điền các thông tin sau vào `.env`:
- `DATABASE_URL`: Connection string của PostgreSQL.
- `CLOUDINARY_*`: Thông tin API từ Cloudinary Dashboard.

### 4. Chuẩn bị Database (PostgreSQL)

Tạo database và (tùy chọn) user trong PostgreSQL. **Xem chi tiết:** [Hướng dẫn chạy lệnh PostgreSQL](./docs/POSTGRESQL.md).

Ví dụ nhanh trong `psql` (`psql -U postgres -h localhost -p 5432`):

```sql
CREATE DATABASE "server-nnptud-lms";
```

### 5. Đồng bộ Database (Prisma)
```bash
npx prisma generate
npx prisma db push

# (Tùy chọn) Mở giao diện quản lý DB
npx prisma studio
```

### 6. Khởi tạo data fake (tùy chọn)
```bash
npm run seed
# hoặc: npx prisma db seed
```
Tạo sẵn: Admin, Giáo viên, 2 Học sinh (mật khẩu: `password123`), 2 lớp, 3 bài tập, bài nộp, điểm, bình luận.

### 7. Chạy Server
```bash
# Chế độ phát triển
npm run dev

# Chế độ production
npm start
```
Server sẽ chạy tại: `http://localhost:3000`

## 📚 API Documentation

### Auth
- `POST /api/register`: Đăng ký tài khoản (body: `name`, `email`, `password`, `role`).
- `POST /api/login`: Đăng nhập lấy Token.

### Upload
- `POST /api/upload`: Upload file lên Cloudinary (form-data: `file`). Trả về `fileUrl`.

### Classes (PRD §4.2, §5.2)
- `POST /api/classes`: Tạo lớp (auto generate `code`).
- `GET /api/classes`: Danh sách lớp (Teacher: lớp mình dạy; Student: lớp đã join).
- `GET /api/classes/:id`: Chi tiết lớp (members, assignments).
- `POST /api/classes/join`: Student join lớp bằng mã code (body: `{ code }`).
- `POST /api/classes/:id/enroll`: Teacher/Admin thêm học sinh (body: `studentId`).
- `PATCH /api/classes/:id`: Cập nhật tên, mô tả, status (ACTIVE/ARCHIVED).

### Assignments (PRD §4.4, §5.3)
- `POST /api/assignments`: Tạo bài tập (body: `title`, `description`, `dueDate`, `classId`, `fileUrl`, `startTime?`, `allowLate?`, `maxScore?`).
- `GET /api/assignments/:id`: Chi tiết bài tập.
- `GET /api/classes/:classId/assignments`: Danh sách bài tập của lớp.

### Submissions (PRD §4.5, §5.4)
- `POST /api/submissions`: Nộp/ cập nhật bài (Student; unique theo assignment + student; kiểm tra deadline & allowLate).
- `GET /api/assignments/:assignmentId/submissions`: Danh sách bài nộp (Teacher: tất cả; Student: chỉ của mình).

### Grades & Comments (PRD §4.6, §4.7)
- `POST /api/grades`: Chấm điểm (body: `submissionId`, `score`; score 0–maxScore).
- `POST /api/comments`: Tạo comment (body: `content`, `assignmentId?`, `submissionId?`).
- `GET /api/comments`: Lấy comment (query: `assignmentId`, `submissionId`).

### Admin (PRD §3.1, §7)
- `GET /api/admin/users`: Danh sách user (query: `role`, `status`).
- `POST /api/admin/users`: Tạo Teacher/Student (body: `name`, `email`, `password`, `role`).
- `PATCH /api/admin/users/:id`: Cập nhật status (ACTIVE/INACTIVE).
- `GET /api/admin/classes`: Danh sách lớp (Admin).

### Realtime (Socket.io – PRD §6)
Client gửi `join_room` với `{ userId, role, classId?, assignmentId?, submissionId? }` để join các room. Events:
- **Teacher**: `submission:new`, `submission:updated`, `grade:updated`.
- **Student**: `grade:updated`, `comment:new`.

## 🔄 Migration từ schema cũ
Schema đã chuyển sang **ClassMember** (bảng riêng), **User.status**, **Class.code** & **status**, **Assignment.allowLate/maxScore**, **Submission.status** (NOT_SUBMITTED | SUBMITTED | LATE_SUBMITTED). Nếu đã có DB cũ:
```bash
npx prisma migrate dev --name prd_schema
# hoặc reset: npx prisma db push --force-reset
npm run seed
```

## 👨‍💻 Author
Team NNPTUD
