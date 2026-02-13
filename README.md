# 🎓 NNPTUD LMS Server

> Backend Server cho hệ thống **Quản lý học tập (LMS)** – Hỗ trợ Giáo viên quản lý lớp học, giao bài tập, chấm điểm và Học sinh nộp bài, xem điểm theo thời gian thực.

---

## 🚀 Tính năng

| Module | Mô tả |
|--------|-------|
| 🔐 **Authentication** | Đăng ký / Đăng nhập JWT, mã hóa mật khẩu bcrypt |
| 👥 **Phân quyền RBAC** | Admin · Teacher · Student – middleware kiểm tra role |
| 🏫 **Quản lý Lớp học** | Tạo lớp (auto-gen code), join bằng mã, enroll student |
| 📝 **Bài tập** | CRUD bài tập, hỗ trợ deadline, cho phép nộp trễ |
| 📤 **Nộp bài** | Upload file (PDF, DOCX, ZIP, Image...) lên Cloudinary |
| ✅ **Chấm điểm** | Teacher chấm điểm, upsert, realtime cập nhật |
| 💬 **Bình luận** | Comment 2 chiều Teacher ↔ Student trên submission |
| ⚡ **Realtime** | Socket.io – thông báo tức thì (nộp bài, chấm điểm, comment) |
| 🛡️ **Admin Panel** | Quản lý users, classes, thống kê, activity logs |

---

## 🛠 Công nghệ sử dụng

| Layer | Công nghệ | Phiên bản |
|-------|-----------|:---------:|
| Runtime | Node.js | 18+ |
| Framework | Express.js | 4.21 |
| Database | PostgreSQL | 15 (Docker) |
| ORM | Prisma | 5.10 |
| Realtime | Socket.io | 4.8 |
| File Storage | Cloudinary | 2.5 |
| Auth | JWT + Bcrypt | – |
| Dev Tools | Nodemon | 3.1 |

---

## 📦 Cài đặt & Chạy dự án

### Yêu cầu
- **Node.js** v18+
- **Docker Desktop** (cho PostgreSQL)
- **npm** v9+

### 1. Clone & cài đặt

```bash
git clone https://github.com/trahoangdev/server-nnptud-lms.git
cd server-nnptud-lms
npm install
```

### 2. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Điền các thông tin trong `.env`:

| Biến | Mô tả | Giá trị mặc định |
|------|-------|------------------|
| `PORT` | Port server | `3000` |
| `DATABASE_URL` | Connection string PostgreSQL | `postgresql://postgres:190704@localhost:5434/server-nnptud-lms?schema=public` |
| `JWT_SECRET` | Secret key cho JWT | (tự đặt) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | (từ Cloudinary Dashboard) |
| `CLOUDINARY_API_KEY` | Cloudinary API key | (từ Cloudinary Dashboard) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | (từ Cloudinary Dashboard) |

### 3. Khởi động Database (Docker) 🐳

PostgreSQL chạy trong Docker container, **không cần cài PostgreSQL trên máy**.

```bash
# Khởi động PostgreSQL + pgAdmin
docker compose up -d

# Kiểm tra trạng thái
docker compose ps
```

| Service | Container | Port | Mô tả |
|---------|-----------|:----:|-------|
| **PostgreSQL 15** | `lms-postgres` | `5434` | Database chính |
| **pgAdmin** | `lms-pgadmin` | `5050` | GUI quản lý DB (tùy chọn) |

**Truy cập pgAdmin:** http://localhost:5050
- Email: `admin@nnptud.edu.vn`
- Password: `admin123`

**Kết nối DB trong pgAdmin:**
- Host: `postgres` (hoặc `host.docker.internal`)
- Port: `5432`
- User: `postgres`
- Password: `190704`

<details>
<summary>📋 Các lệnh Docker thường dùng</summary>

```bash
# Start database
docker compose up -d

# Stop (giữ data)
docker compose down

# Stop + xóa toàn bộ data
docker compose down -v

# Xem logs PostgreSQL
docker compose logs -f postgres

# Truy cập psql trong container
docker compose exec postgres psql -U postgres -d server-nnptud-lms
```

</details>

### 4. Đồng bộ Schema (Prisma)

```bash
# Generate Prisma Client
npx prisma generate

# Push schema lên database
npx prisma db push

# (Tùy chọn) Mở Prisma Studio – GUI quản lý DB
npx prisma studio
```

### 5. Khởi tạo dữ liệu mẫu

```bash
npm run seed
```

**Dữ liệu seed bao gồm:**

| Loại | Chi tiết | Mật khẩu |
|------|---------|:---------:|
| 👤 Admin | admin@nnptud.edu.vn | `password123` |
| 👨‍🏫 Teacher | teacher@nnptud.edu.vn | `password123` |
| 👨‍🎓 Student 1 | student@nnptud.edu.vn | `password123` |
| 👨‍🎓 Student 2 | student2@nnptud.edu.vn | `password123` |
| 🏫 2 Lớp | "Toán cao cấp 1", "Lập trình Web" | – |
| 📝 3 Bài tập | Chương 1, Chương 2, Đồ án giữa kỳ | – |
| 📤 3 Bài nộp | 2 SUBMITTED, 1 LATE | – |
| ✅ 2 Điểm | 8.5 và 9.0 | – |
| 💬 2 Comment | Bình luận mẫu | – |

### 6. Chạy Server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

> 🌐 Server chạy tại: **http://localhost:3000**

---

## 📁 Cấu trúc dự án

```
server-nnptud-lms/
├── app.js                  # Express app + HTTP server + Socket.io
├── db.js                   # Prisma Client singleton
├── route.js                # Tất cả API endpoints (1214 dòng)
├── socket.js               # Socket.io configuration
│
├── middleware/
│   └── auth.js             # JWT authenticate + RBAC authorize
│
├── prisma/
│   ├── schema.prisma       # Database schema (7 models, 5 enums)
│   ├── seed.js             # Seed data
│   └── migrations/         # Database migrations
│
├── docs/
│   └── POSTGRESQL.md       # Hướng dẫn PostgreSQL
│
├── docker-compose.yml      # PostgreSQL + pgAdmin
├── .env                    # Environment variables
├── .env.example            # Template .env
├── package.json
└── .gitignore
```

---

## 📊 Database Schema

**7 Models – 5 Enums** (chi tiết: `prisma/schema.prisma`)

```
User ──1:N──► Class (teacher)
  │              │
  │           1:N│
  │              ▼
  ├──1:N──► ClassMember
  │
  ├──1:N──► Assignment ──1:N──► Submission ──1:1──► Grade
  │                                  │
  ├──1:N──► Comment ◄───────────────┘
  └──1:N──► Grade (gradedBy)
```

| Model | Mô tả |
|-------|-------|
| `User` | Tài khoản (Admin / Teacher / Student) |
| `Class` | Lớp học (name, code unique, teacher) |
| `ClassMember` | Quan hệ Student ↔ Class (join/leave) |
| `Assignment` | Bài tập (title, deadline, maxScore, allowLate) |
| `Submission` | Bài nộp (content, file, status, deadline check) |
| `Grade` | Điểm (score, 1:1 với Submission) |
| `Comment` | Bình luận (trên Assignment hoặc Submission) |

---

## 📚 API Endpoints

> **Base URL:** `http://localhost:3000/api`
> 
> **Auth Header:** `Authorization: Bearer <JWT_TOKEN>`

### 🔐 Auth

| Method | Endpoint | Mô tả | Auth |
|:------:|----------|-------|:----:|
| POST | `/api/register` | Đăng ký tài khoản | ❌ |
| POST | `/api/login` | Đăng nhập, lấy JWT token | ❌ |
| GET | `/api/me` | Lấy thông tin profile | ✅ |

### 📤 Upload

| Method | Endpoint | Mô tả | Auth |
|:------:|----------|-------|:----:|
| POST | `/api/upload` | Upload file lên Cloudinary (form-data) | ✅ |

### 🏫 Classes

| Method | Endpoint | Mô tả | Role |
|:------:|----------|-------|:----:|
| POST | `/api/classes` | Tạo lớp (auto-gen code) | Teacher, Admin |
| GET | `/api/classes` | Danh sách lớp (filtered by role) | All |
| GET | `/api/classes/:id` | Chi tiết lớp + members + assignments | All |
| PATCH | `/api/classes/:id` | Cập nhật lớp (name, description, status) | Teacher (owner), Admin |
| DELETE | `/api/classes/:id` | Xóa lớp | Teacher (owner), Admin |
| POST | `/api/classes/join` | Student join lớp bằng code | Student |
| POST | `/api/classes/:id/enroll` | Teacher thêm student vào lớp | Teacher, Admin |

### 📝 Assignments

| Method | Endpoint | Mô tả | Role |
|:------:|----------|-------|:----:|
| POST | `/api/assignments` | Tạo bài tập | Teacher, Admin |
| GET | `/api/assignments/:id` | Chi tiết bài tập | All (authorized) |
| PATCH | `/api/assignments/:id` | Cập nhật bài tập | Teacher (owner), Admin |
| DELETE | `/api/assignments/:id` | Xóa bài tập | Teacher (owner), Admin |
| GET | `/api/classes/:classId/assignments` | Bài tập của lớp | All (authorized) |
| GET | `/api/student/assignments` | Tất cả bài tập (Student) | Student |

### 📤 Submissions

| Method | Endpoint | Mô tả | Role |
|:------:|----------|-------|:----:|
| POST | `/api/submissions` | Nộp / cập nhật bài (upsert, check deadline) | Student |
| GET | `/api/assignments/:id/submissions` | Danh sách bài nộp | Teacher: all, Student: own |

### ✅ Grades

| Method | Endpoint | Mô tả | Role |
|:------:|----------|-------|:----:|
| POST | `/api/grades` | Chấm điểm (upsert, 0–maxScore) | Teacher, Admin |

### 💬 Comments

| Method | Endpoint | Mô tả | Role |
|:------:|----------|-------|:----:|
| POST | `/api/comments` | Tạo comment | All (authorized) |
| GET | `/api/comments` | Lấy comments (?assignmentId, ?submissionId) | All (authorized) |
| PATCH | `/api/comments/:id` | Sửa comment | Author / Teacher / Admin |
| DELETE | `/api/comments/:id` | Xóa comment | Author / Teacher / Admin |

### 🛡️ Admin

| Method | Endpoint | Mô tả | Role |
|:------:|----------|-------|:----:|
| GET | `/api/admin/users` | Danh sách users (?role, ?status) | Admin |
| POST | `/api/admin/users` | Tạo user mới | Admin |
| PATCH | `/api/admin/users/:id` | Cập nhật user (status, name, email) | Admin |
| GET | `/api/admin/classes` | Danh sách classes | Admin |
| GET | `/api/admin/stats` | Thống kê Dashboard | Admin |
| GET | `/api/admin/activity-logs` | Nhật ký hoạt động | Admin |

---

## ⚡ Realtime (Socket.io)

### Kết nối

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.emit("join_room", {
  userId: 1,
  role: "STUDENT",
  classId: 1,           // optional
  assignmentId: 1,      // optional
  submissionId: 1       // optional
});
```

### Rooms

| Room | Ai join | Events nhận |
|------|---------|-------------|
| `user_{userId}` | Tất cả | `grade:updated`, `comment:new` |
| `teachers` | Teacher, Admin | `submission:new` |
| `class:{classId}` | Members & Teacher | `grade:updated` |
| `assignment:{assignmentId}` | Đang xem assignment | `submission:new`, `submission:updated` |
| `submission:{submissionId}` | Đang xem submission | `comment:new`, `grade:updated` |

### Events

| Event | Khi nào | Payload chính |
|-------|---------|--------------|
| `submission:new` | Student nộp bài lần đầu | `{ submission_id, student_name, assignment_title }` |
| `submission:updated` | Student cập nhật bài nộp | `{ submission_id, status, updated_at }` |
| `grade:updated` | Teacher chấm/sửa điểm | `{ score, assignment_title, student_id }` |
| `comment:new` | Gửi comment mới | `{ content, author_name, submission_id }` |

---

## 🔄 Migration

```bash
# Tạo migration mới
npx prisma migrate dev --name <tên_migration>

# Áp dụng migration (production)
npx prisma migrate deploy

# Reset database (development)
npx prisma db push --force-reset
npm run seed
```

---

## 📖 Tài liệu chi tiết

Xem thêm tại thư mục [`/docs`](../docs/):

| File | Nội dung |
|------|---------|
| [01 – Tổng quan dự án](../docs/01-tong-quan-du-an.md) | Kiến trúc, tech stack, roadmap |
| [03 – Backend Plan](../docs/03-backend-plan.md) | Kế hoạch refactor, API mới, security |
| [05 – Database Design](../docs/05-database-design.md) | ERD, chi tiết models, indexes |
| [06 – API Specification](../docs/06-api-specification.md) | Đặc tả API đầy đủ request/response |
| [07 – Realtime Socket](../docs/07-realtime-socket.md) | Socket.io architecture, events |
| [09 – Deployment Guide](../docs/09-deployment-guide.md) | Docker, VPS, CI/CD |

---

## 👨‍💻 Author

**Team NNPTUD** – Đề tài: Hệ thống LMS Mini
