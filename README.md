# Hotel Management Backend

A robust, clean Node.js + Express.js backend with MySQL and Knex migrations.
The project architecture, response handling, and error management follow the patterns established in **TradeNexa Backend**.

---

## 🏛️ Project Architecture (TradeNexa Pattern)

```
d:/Hotal_Management_Backend/
├── config/
│   └── (Environment and general configurations)
├── constants/
│   └── index.js             # HTTP_STATUS, MESSAGES, ROLE_CODES, TOKEN_TYPES
├── controllers/
│   └── authController.js     # Lean controllers delegating to services & returning success()
├── database/
│   ├── knex.js              # Centralized Knex database client
│   ├── migrations/          # Knex schema migrations (users, password_reset_tokens)
│   └── seeds/               # Seed scripts (admin user)
├── middleware/
│   ├── auth.js              # Session cookie / Bearer JWT auth & role guards
│   ├── errorHandler.js      # Global error handler (AppError, MySQL constraints)
│   └── validation.js        # express-validator runner mapping to AppError
├── models/
│   ├── userModel.js         # Knex database queries for users
│   └── tokenModel.js        # Knex database queries for password reset tokens
├── routers/
│   ├── index.js             # Main router aggregator (/api/v1 and /api)
│   └── authRouter.js        # Authentication route definitions
├── services/
│   ├── authService.js       # Core business logic (throws AppError)
│   └── emailService.js      # Nodemailer service with connection pooling & privacy masking
├── templates/
│   └── emailTemplates.js    # Responsive HTML templates (VIP hero poster reset email)
├── utils/
│   ├── jwt.js               # JWT tokens & HTTP-only cookie handlers
│   └── response.js          # AppError class and success() response formatter
├── app.js                   # Express application setup
├── server.js                # Server bootstrap & MySQL connection verification
├── knexfile.js              # Knex MySQL configuration
├── package.json
└── .env / .env.example
```

---

## 📦 Standardized Responses & Error Handling

### 1. Success Response (`utils/response.js`)
All successful API calls return a uniform format:
```json
{
  "success": true,
  "message": "Human-readable message",
  "data": { ... }
}
```

### 2. Error Response (`middleware/errorHandler.js` & `utils/response.js`)
All operational errors (`AppError`), validation failures, and database errors follow a uniform format:
```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email address format"
    }
  ]
}
```

- **AppError**: Services throw `new AppError(message, statusCode)`.
- **Validation**: Caught by `validation.js` middleware and converted to `AppError(message, 400, errors)`.
- **Database Errors**: `ER_DUP_ENTRY` (1062) automatically maps to `409 Conflict`, foreign key constraints map to `400` or `409`.

---

## 📡 API Reference

Base endpoints are mounted under both `/api/v1` and `/api`:

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/hotel/register` | Register new hotel & activate 30-day trial | No |
| `POST` | `/api/v1/auth/login` | Login with email & password (sets HTTP-only cookies) | No |
| `POST` | `/api/v1/auth/refresh-token` | Rotate access token using `refreshToken` cookie | No (reads cookie) |
| `POST` | `/api/v1/auth/logout` | Clear session cookies | No |
| `POST` | `/api/v1/auth/forgot-password` | Generate & email secure reset link with CTA button | No |
| `GET` | `/api/v1/auth/verify-token` | Validate single-use reset token from query/body | No |
| `POST` | `/api/v1/auth/reset-password` | Reset password using `{ token, password }` | No |
| `PUT` | `/api/v1/auth/change-password` | Change password for logged-in user | Yes (cookie / Bearer) |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile | Yes (cookie / Bearer) |
| `GET` | `/api/v1/subscription-plans` | List active plans (supports cycle, popularity filters & pagination) | No |
| `GET` | `/api/v1/subscription-plans/:id` | Get single subscription plan details with features | No |
| `POST` | `/api/v1/subscription-plans` | Create subscription plan with synchronized features | Yes (`SUPER_ADMIN`) |
| `PUT` | `/api/v1/subscription-plans/:id` | Partial update plan details & synchronize features | Yes (`SUPER_ADMIN`) |
| `DELETE` | `/api/v1/subscription-plans/:id` | Soft-delete plan (sets `deleted_at`) | Yes (`SUPER_ADMIN`) |
| `POST` | `/api/v1/subscription-plans/reset-defaults` | Restore standard 6 default enterprise plans | Yes (`SUPER_ADMIN`) |
| `GET` | `/health` | Server and database health check | No |

---

## 🚀 Running the Project

```bash
# 1. Run migrations & seeds
npm run migrate
npm run seed

# 2. Start development server
npm run dev
```

*Initial Seeded Account:*
- **Email:** `admin@hotel.com`
- **Password:** `Admin@123`
- **Role:** `SUPER_ADMIN`
