# Hướng dẫn chạy lệnh PostgreSQL (server-nnptud-lms)

Hướng dẫn cài đặt, kết nối và chạy các lệnh PostgreSQL để chuẩn bị database cho dự án LMS.

---

## 1. Cài đặt PostgreSQL

### Windows
- Tải installer: https://www.postgresql.org/download/windows/
- Chạy installer, chọn port mặc định **5432**, nhớ **mật khẩu** user `postgres`.
- Trong bước cuối, có thể bỏ qua Stack Builder.

### macOS (Homebrew)
```bash
brew install postgresql@16
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## 2. Kết nối vào PostgreSQL

### Cách 1: Dùng `psql` (dòng lệnh)

**Windows** (sau khi cài, thêm PostgreSQL vào PATH hoặc dùng "SQL Shell (psql)" từ Start Menu):

```bash
# Kết nối với user mặc định postgres (sẽ hỏi mật khẩu)
psql -U postgres -h localhost -p 5432
```

**Linux/macOS** (user `postgres` có quyền peer auth trên nhiều bản cài):

```bash
# Ubuntu/Debian: chuyển sang user postgres rồi chạy psql
sudo -u postgres psql

# Hoặc kết nối trực tiếp (nhập mật khẩu khi được hỏi)
psql -U postgres -h localhost -p 5432
```

Khi đã vào `psql`, prompt có dạng: `postgres=#`. Các lệnh SQL gõ ở đây.

### Cách 2: Dùng pgAdmin (giao diện)

- Cài pgAdmin: https://www.pgadmin.org/download/
- Mở pgAdmin → Add New Server:
  - **Host:** `localhost`
  - **Port:** `5432`
  - **Username:** `postgres`
  - **Password:** (mật khẩu đã đặt khi cài)
- Sau khi kết nối, chuột phải **Databases** → **Query Tool** để mở cửa sổ chạy SQL.

---

## 3. Các lệnh SQL cần chạy cho dự án LMS

Chạy lần lượt trong `psql` hoặc Query Tool của pgAdmin.

### 3.1. Tạo database

```sql
CREATE DATABASE "server-nnptud-lms";
```

(Kiểm tra đã tạo: `\l` trong psql hoặc xem danh sách Databases trong pgAdmin.)

### 3.2. (Tùy chọn) Tạo user riêng cho ứng dụng

Nếu muốn dùng user khác `postgres` cho app:

```sql
-- Tạo user (thay your_user, your_password bằng tên/mật khẩu bạn chọn)
CREATE USER your_user WITH PASSWORD 'your_password';

-- Cho phép user tạo database (một số bản cài cần)
ALTER USER your_user CREATEDB;

-- Gán quyền trên database vừa tạo
GRANT ALL PRIVILEGES ON DATABASE "server-nnptud-lms" TO your_user;

-- Prisma cần quyền trên schema public
\c "server-nnptud-lms"
GRANT ALL ON SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

**Lưu ý:** Trong psql, `\c "server-nnptud-lms"` dùng để chuyển sang database đó trước khi chạy các lệnh `GRANT` trên `public`.

### 3.3. Nếu dùng luôn user `postgres`

Chỉ cần tạo database:

```sql
CREATE DATABASE "server-nnptud-lms";
```

Trong `.env`, đặt:

```env
DATABASE_URL="postgresql://postgres:MẬT_KHẨU_POSTGRES@localhost:5432/server-nnptud-lms?schema=public"
```

---

## 4. Một số lệnh psql hữu ích

| Lệnh | Mô tả |
|------|--------|
| `\l` | Liệt kê tất cả database |
| `\c "tên_db"` | Kết nối (chuyển) sang database |
| `\dt` | Liệt kê bảng trong database hiện tại |
| `\du` | Liệt kê user/role |
| `\q` | Thoát psql |

---

## 5. Chuỗi kết nối `DATABASE_URL`

Định dạng:

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

Ví dụ (user tự tạo):

```env
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/server-nnptud-lms?schema=public"
```

Ví dụ (user `postgres`):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/server-nnptud-lms?schema=public"
```

**Lưu ý:** Nếu mật khẩu có ký tự đặc biệt (`@`, `#`, `:`, v.v.), cần **URL-encode** (ví dụ `@` → `%40`) trong `DATABASE_URL`.

---

## 6. Sau khi tạo database

Trong thư mục `server-nnptud-lms`:

```bash
npx prisma generate
npx prisma db push
```

Rồi chạy server: `npm run dev` hoặc `npm start`.

---

## 7. Xử lý lỗi thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| `password authentication failed` | Kiểm tra user/password trong `DATABASE_URL` và trong PostgreSQL. |
| `database "server-nnptud-lms" does not exist` | Chạy `CREATE DATABASE "server-nnptud-lms";` như mục 3.1. |
| `connection refused` / `ECONNREFUSED` | PostgreSQL chưa chạy. Khởi động service (Windows: Services; Linux: `sudo systemctl start postgresql`). |
| `role "xxx" does not exist` | Tạo user bằng `CREATE USER ...` hoặc dùng user `postgres` trong `DATABASE_URL`. |

---

## 8. Tài liệu tham khảo

- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Prisma – PostgreSQL](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
