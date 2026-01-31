# Middleware bảo mật (Auth & Role)

## Cách dùng

- **`authenticateToken`**: Xác thực JWT. Mọi route cần đăng nhập đều dùng middleware này trước.
- **`authorizeRole(roles)`**: Phân quyền theo role. Đặt sau `authenticateToken`. Ví dụ: `authorizeRole(["TEACHER", "ADMIN"])`.

## Ánh xạ route → middleware (trong `route.js`)

| Nhóm | Middleware | Route ví dụ |
|------|------------|-------------|
| Chỉ cần đăng nhập | `authenticateToken` | GET /classes, GET /classes/:id, GET /assignments/:id, GET/POST comments, upload |
| Teacher hoặc Admin | `authenticateToken` + `authorizeRole(["TEACHER","ADMIN"])` | POST/PATCH/DELETE classes, POST/PATCH/DELETE assignments, POST /grades, POST /classes/:id/enroll |
| Chỉ Student | `authenticateToken` + `authorizeRole(["STUDENT"])` | POST /classes/join, GET /student/assignments, POST /submissions |
| Chỉ Admin | `authenticateToken` + `authorizeRole(["ADMIN"])` | GET/POST/PATCH /admin/users, GET /admin/classes |

Route công khai (không middleware): POST /login, POST /register.
