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

### 4. Đồng bộ Database (Prisma)
```bash
# Đẩy schema lên Database
npx prisma db push

# (Tùy chọn) Mở giao diện quản lý DB
npx prisma studio
```

### 5. Chạy Server
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

### Classes
- `POST /api/classes`: Tạo lớp mới (Teacher/Admin).
- `GET /api/classes`: Lấy danh sách lớp (theo quyền hạn).
- `POST /api/classes/:id/enroll`: Thêm học sinh vào lớp.

### Assignments (Bài tập)
- `POST /api/assignments`: Tạo bài tập (Teacher).
- `GET /api/assignments/:id`: Xem chi tiết.

### Submissions (Nộp bài)
- `POST /api/submissions`: Nộp bài (Student).
- `GET /api/assignments/:id/submissions`: Xem danh sách bài nộp (Teacher).

### Grades (Điểm)
- `POST /api/grades`: Chấm điểm (Teacher).

## 👨‍💻 Author
Team NNPTUD
