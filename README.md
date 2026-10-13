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
│   └── emailService.js      # Brevo (Sendinblue) REST API service with privacy masking
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
| `GET` | `/health` | Server health check | No |
| `GET` | `/api/health` | API namespace health check | No |
| `POST` | `/api/v1/auth/login` | Login with email & password (sets HTTP-only cookies & returns Bearer token) | No |
| `POST` | `/api/v1/auth/refresh-token` | Rotate access token using `refreshToken` cookie / body | No (reads cookie) |
| `POST` | `/api/v1/auth/logout` | Clear session cookies | No |
| `POST` | `/api/v1/auth/forgot-password` | Generate & email secure reset link with CTA button | No |
| `POST` | `/api/v1/auth/reset-password` | Reset password using `{ token, password }` | No |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile | Yes (cookie / Bearer) |
| `POST` | `/api/v1/hotel/register` | Register new hotel & activate 30-day trial (alias `/hotels/register`) | No |
| `GET` | `/api/v1/subscription-plans` | List active plans (supports cycle, popularity filters & pagination) | No |
| `GET` | `/api/v1/subscription-plans/:id` | Get single subscription plan details with features | No |
| `POST` | `/api/v1/subscription-plans` | Create subscription plan with synchronized features | Yes (`SUPER_ADMIN`) |
| `PUT` | `/api/v1/subscription-plans/:id` | Partial update plan details & synchronize features | Yes (`SUPER_ADMIN`) |
| `DELETE` | `/api/v1/subscription-plans/:id` | Soft-delete plan (sets `deleted_at`) | Yes (`SUPER_ADMIN`) |
| `POST` | `/api/v1/subscription-plans/reset-defaults` | Restore standard 6 default enterprise plans | Yes (`SUPER_ADMIN`) |
| `GET` | `/api/v1/room-types` | List active room categories (optional `hotel_id` filter) | No |
| `GET` | `/api/v1/room-types/:id` | Get single room category with photos | No |
| `POST` | `/api/v1/room-types` | Create room category with S3 photo uploads | No |
| `PUT` | `/api/v1/room-types/:id` | Update room category details | No |
| `DELETE` | `/api/v1/room-types/:id` | Safely delete room category (checks assigned physical rooms) | No |
| `POST` | `/api/v1/rooms` | Create physical room with composite floor uniqueness & S3 media | No |
| `GET` | `/api/v1/rooms` | List rooms with filters (`hotel_id`, `floor`, `room_type_id`, `status`, pagination) | No |
| `GET` | `/api/v1/rooms/:id` | Get single physical room by ID | No |
| `PUT` | `/api/v1/rooms/:id` | Update physical room details | No |
| `DELETE` | `/api/v1/rooms/:id` | Soft-delete physical room | No |
| `POST` | `/api/v1/bookings` | Create booking (overlap guard, tax/GST calculations, S3 media) | Optional |
| `GET` | `/api/v1/bookings` | List bookings (filters: `hotel_id`, `room_id`, `payment_status`, dates, search) | Optional |
| `GET` | `/api/v1/bookings/:id` | Get complete booking details by ID | Optional |
| `PUT` | `/api/v1/bookings/:id` | Update booking details & auto recalculate financial totals | Optional |
| `DELETE` | `/api/v1/bookings/:id` | Soft-delete booking (releases room availability) | Optional |
| `POST` | `/api/v1/users` | Create staff member (`RECEPTIONIST`, `MANAGER`, `HOUSEKEEPING`, `ACCOUNTANT`) | Yes (`HOTEL_ADMIN` / `SUPER_ADMIN`) |
| `GET` | `/api/v1/users` | List staff members with pagination, sorting, and search | Yes (`HOTEL_ADMIN` / `SUPER_ADMIN`) |
| `GET` | `/api/v1/users/:id` | Get staff member details by ID | Yes (`HOTEL_ADMIN` / `SUPER_ADMIN`) |
| `PUT` | `/api/v1/users/:id` | Update staff member details | Yes (`HOTEL_ADMIN` / `SUPER_ADMIN`) |
| `DELETE` | `/api/v1/users/:id` | Soft-delete staff member (prevents self-deletion) | Yes (`HOTEL_ADMIN` / `SUPER_ADMIN`) |

---

## 📬 Postman Collection

A complete, production-grade Postman collection is ready to import at:
- **File:** `postman_collection.json` (Collection Schema v2.1.0)
- **Regenerate Command:** `npm run generate:postman`

### How to Import & Use:
1. Open **Postman**.
2. Click **Import** (top-left) -> select `d:/Hotal_Management_Backend/postman_collection.json`.
3. The collection is organized into 8 modular folders:
   - `1. Health & System Diagnostics`
   - `2. Authentication`
   - `3. Hotel Onboarding & Registration`
   - `4. Subscription Plans`
   - `5. Room Types (Categories)`
   - `6. Physical Rooms`
   - `7. Bookings Management`
   - `8. User & Staff Management`
4. **Auto-Token Propagation:** Execute **Login User** or **Register New Hotel**; the test scripts automatically save `accessToken`, `refreshToken`, and `hotelId` to collection variables so protected endpoints work instantly without manual copy-pasting!

---

## 🚀 Running the Project

```bash
# 1. Run migrations & seeds
npm run migrate
npm run seed

# 2. Start development server
npm run dev

# 3. Run all automated test suites
npm test
```

*Initial Seeded Account:*
- **Email:** `admin@hotel.com`
- **Password:** `Admin@123`
- **Role:** `SUPER_ADMIN`
