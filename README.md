# Hotel Management Backend

REST API for a multi-hotel property management system (PMS). It handles hotel onboarding, staff and
role management, room inventory, bookings with GST-aware billing, payment history, PDF folios and
live room status updates.

- **Runtime:** Node.js 18+ (20 LTS recommended), Express 4
- **Database:** MySQL 8+ through Knex (migrations and seeds)
- **Auth:** JWT access and refresh tokens (Bearer header or HTTP-only cookies), role-based access control
- **Real time:** Socket.IO (`room:status` event)
- **Storage:** S3-compatible object storage for images (AWS S3, Cloudflare R2, MinIO)
- **Email:** Brevo transactional API, BullMQ queue with in-memory fallback
- **PDF:** Puppeteer renders the booking folio

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [NPM Scripts](#npm-scripts)
4. [Project Structure](#project-structure)
5. [Architecture and Conventions](#architecture-and-conventions)
6. [Authentication and Roles](#authentication-and-roles)
7. [API Reference](#api-reference)
8. [Business Rules](#business-rules)
9. [Real-time Room Status (Socket.IO)](#real-time-room-status-socketio)
10. [Scheduled Jobs](#scheduled-jobs)
11. [Postman Collection](#postman-collection)
12. [Deployment](#deployment)
13. [Contributing](#contributing)
14. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

| Tool | Version |
| :--- | :--- |
| Node.js | 18 or newer |
| MySQL | 8.0 or newer |
| Redis | Optional (email queue). The app falls back to an in-memory queue without it. |

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file and fill in the values
cp .env.example .env          # Windows cmd: copy .env.example .env

# 3. Create the database (name must match DB_NAME)
mysql -u root -p -e "CREATE DATABASE hotel_management_db CHARACTER SET utf8mb4;"

# 4. Create tables and the first Super Admin user
npm run migrate
npm run seed

# 5. Start the server with auto-reload
npm run dev
```

Check that the API is running: `GET http://127.0.0.1:5001/api/health`

The seed creates a Super Admin: `admin@hotel.com` / `Admin@123`. **Change this password
in any shared or production environment.**

---

## Environment Variables

All variables are documented inline in [`.env.example`](.env.example). Summary:

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | No | `development` | `development`, `production` or `test` |
| `PORT` | No | `5001` | HTTP port |
| `APP_NAME` | No | `Hotel Management Backend` | Name in logs and emails |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Production | local MySQL | Database connection |
| `DB_TEST_*` | No | - | Database used when `NODE_ENV=test` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Production | built-in dev fallback | Token signing secrets. Always set real values in production. |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | No | `1h`, `30d` | Token lifetimes |
| `FRONTEND_URL` | Yes | `http://localhost:3000` | CORS origin and password reset link base |
| `RESET_PASSWORD_URL` | No | `FRONTEND_URL` | Overrides the password reset link base |
| `ADMIN_URL`, `WEB_URL` | No | - | Email link bases and CORS origins |
| `ALLOWED_ORIGINS` | No | - | Extra CORS origins, comma separated |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `FROM_NAME` | No | - | Email delivery. Without a key, emails are only logged. |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | No | `127.0.0.1`, `6379` | BullMQ email queue |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_NAME`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` | For uploads | - | Image storage |

Notes:

- CORS always allows `localhost` and `127.0.0.1` on any port, `*.vercel.app`, `*.railway.app` and `myownpms.com`.
- The password reset link follows a `localhost` request origin (so a local frontend works against a deployed API).
  Any other origin is ignored and `RESET_PASSWORD_URL` or `FRONTEND_URL` is used.

---

## NPM Scripts

| Script | Description |
| :--- | :--- |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start with Node (production) |
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:rollback` | Roll back the last migration batch |
| `npm run seed` | Run seeds (creates the Super Admin if missing) |
| `npm run generate:postman` | Regenerate `postman_collection.json` |

---

## Project Structure

```
.
├── app.js                    # Express app: CORS, parsers, routes, 404 and error handlers
├── server.js                 # Entry point: DB check, HTTP + Socket.IO, cron jobs, graceful shutdown
├── knexfile.js               # Knex config per environment
├── constants/                # HTTP status, messages, roles, room/booking/payment constants
├── routers/                  # Route definitions, validators and role guards
├── controllers/              # Thin HTTP handlers (no business logic)
├── services/                 # Business logic. Throws AppError
├── models/                   # Knex queries and row formatting
├── middleware/               # auth, validators, multer upload, global error handler
├── sockets/                  # Socket.IO server and room status publisher
├── queues/  workers/         # Email queue (BullMQ + in-memory fallback) and worker
├── templates/                # Email templates and the booking folio HTML
├── utils/                    # jwt, response/AppError, hotelScope, json, files, password, emailValidator
├── database/
│   ├── knex.js               # Shared Knex client
│   ├── migrations/           # Schema history. Never edit an applied migration
│   └── seeds/                # Seed data
├── scripts/                  # Tooling (Postman generator)
└── uploads/pdfs/             # Generated folios (cleaned by a cron job)
```

---

## Architecture and Conventions

Request flow:

```
router -> validator -> controller -> service -> model -> database
```

| Layer | Responsibility |
| :--- | :--- |
| Router | URL, auth and role guards, validators |
| Validator | `express-validator` rules, errors mapped to a uniform response |
| Controller | Reads the request, calls a service, returns `success(...)` |
| Service | Business rules, transactions, side effects (email, socket, storage) |
| Model | SQL through Knex and formatting of rows |

Conventions:

- **snake_case** for all request and response fields.
- **`hotel_id` comes only from the authenticated user.** Clients never choose which hotel to act on.
- Services throw `new AppError(message, statusCode)`. Never send error responses from services.
- Reuse shared helpers from `utils/` and constants from `constants/` instead of repeating them.
- Soft deletes use `deleted_at`. Queries must exclude deleted rows.
- Schema changes go in a new migration file. Never modify an existing migration.

### Response format

Success:

```json
{ "success": true, "message": "Booking retrieved successfully.", "data": {} }
```

Error (validation, `AppError` and database errors):

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [{ "field": "email", "message": "Please enter a valid email address format" }]
}
```

Database constraint errors map to `409 Conflict` (duplicates) or `400` (foreign keys).

---

## Authentication and Roles

- Log in with `POST /api/v1/auth/login`. The response contains a Bearer access token and sets
  `accessToken` / `refreshToken` HTTP-only cookies.
- Send the token as `Authorization: Bearer <access_token>`, or rely on the cookie in browsers.
- Renew with `POST /api/v1/auth/refresh-token`.

| Role | Access |
| :--- | :--- |
| `SUPER_ADMIN` | Platform owner. Manages subscription plans. |
| `HOTEL_ADMIN` | Full access to their own hotel: staff, rooms, room types, bookings |
| `RECEPTIONIST` | Rooms, room types and bookings of their own hotel |
| `MANAGER`, `HOUSEKEEPING`, `ACCOUNTANT` | Staff accounts created by a hotel admin (can log in and use real-time updates) |

---

## API Reference

All routes are mounted under `/api/v1` and `/api`. Singular aliases (`/hotel`, `/room`, `/booking`,
`/user`) also exist.

### Auth and onboarding

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Health check (also `/api/health`) | Public |
| `POST` | `/auth/login` | Log in | Public |
| `POST` | `/auth/refresh-token` | Issue a new access token | Public (cookie or body) |
| `POST` | `/auth/logout` | Clear session cookies | Public |
| `POST` | `/auth/forgot-password` | Email a reset link | Public |
| `POST` | `/auth/reset-password` | Reset with `{ token, password }` | Public |
| `GET` | `/auth/me` | Current user profile | Authenticated |
| `POST` | `/hotel/register` | Register a hotel and start the free trial | Public |

### Subscription plans

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/subscription-plans` | List plans | Public |
| `GET` | `/subscription-plans/:id` | Plan with features | Public |
| `POST` | `/subscription-plans` | Create a plan | `SUPER_ADMIN` |
| `PUT` | `/subscription-plans/:id` | Update a plan | `SUPER_ADMIN` |
| `DELETE` | `/subscription-plans/:id` | Archive a plan | `SUPER_ADMIN` |
| `POST` | `/subscription-plans/reset-defaults` | Restore default plans | `SUPER_ADMIN` |

### Room types and rooms (`HOTEL_ADMIN`, `RECEPTIONIST`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` / `POST` | `/room-types` | List / create room types (multipart for images) |
| `GET` / `PUT` / `DELETE` | `/room-types/:id` | Details / update / delete |
| `GET` / `POST` | `/rooms` | List (filters: `floor`, `room_type_id`, `status`, `is_active`, `page`, `limit`, `sort_by`, `sort_order`) / create |
| `GET` / `PUT` | `/rooms/:id` | Details / update |
| `PATCH` | `/rooms/:id/status` | Change room status |
| `DELETE` | `/rooms/:id` | Soft delete (only `AVAILABLE` rooms) |

Room statuses: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `CLEANING`, `MAINTENANCE`, `BLOCKED`.

### Bookings (`HOTEL_ADMIN`, `RECEPTIONIST`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/bookings` | Create a booking (multipart for guest ID images) |
| `GET` | `/bookings` | Paginated list: `id`, `hotel_id`, `booking_number`, `primary_guest_name`, `mobile_number`, `rooms` |
| `GET` | `/bookings/:id` | Full booking including `payment_history` |
| `GET` | `/bookings/:id/pdf` | Generate the folio PDF |
| `PUT` | `/bookings/:id` | Update a booking and recalculate totals |
| `PATCH` | `/bookings/:id/status` | Change the stay status |
| `POST` | `/bookings/:id/check-out` | Check out and record the final payment |
| `DELETE` | `/bookings/:id` | Soft delete |

List filters: `page`, `limit`, `room_id`, `payment_status`, `booking_status`, `search`,
`booking_number`, `primary_guest_name`, `guest_name`, `mobile_number`, `check_in_from`,
`check_in_to`, `check_out_from`, `check_out_to`.

Stay statuses: `PENDING`, `CONFIRMED`, `CHECKED_IN`, `CANCELLED`, `NO_SHOW`, `CHECKED_OUT`.
Payment statuses (bill): `PENDING`, `PARTIALLY_PAID`, `PAID`.
Payment methods: `CASH`, `ONLINE`, `CARD`, `UPI`, `BANK_TRANSFER`.

### Staff users (`HOTEL_ADMIN`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` / `POST` | `/users` | List / create staff |
| `GET` / `PUT` / `DELETE` | `/users/:id` | Details / update / soft delete (not yourself) |
| `PATCH` | `/users/:id/account-status` | Enable or disable an account |

Full request and response examples live in the [Postman collection](#postman-collection).

---

## Business Rules

**Booking and rooms**

- A new booking defaults to `CHECKED_IN` and sets its rooms to `OCCUPIED`.
- A room cannot be booked twice for overlapping dates. `CHECKED_OUT`, `CANCELLED` and `NO_SHOW` stays do not block dates.
- After check-out the room becomes `CLEANING`, then `AVAILABLE` again automatically (see [Scheduled Jobs](#scheduled-jobs)).
- Deleted rooms still show their number, floor and type on past bookings.

**Billing**

```
taxable_amount = base_amount - discount_amount
gst_amount     = taxable_amount x gst_rate / 100        (default 18%)
total_amount   = taxable_amount + gst_amount + extra_charges_total + late_checkout_charge
due_amount     = total_amount - paid_amount
```

- GST applies only to `base_amount - discount_amount`. Extra charges and the late checkout fee are not taxed.
- `extra_charges_total`, `late_checkout_charge` and `late_checkout_hours` are accepted **only at check-out**.
- Check-out requires the exact remaining due amount to be paid.
- Each payment is stored in `booking_payments` and returned as `payment_history` on `GET /bookings/:id`.

---

## Real-time Room Status (Socket.IO)

Connect to the server root, for example `http://127.0.0.1:5001` (use `127.0.0.1` rather than
`localhost` to avoid IPv6 resolution issues).

```js
import { io } from 'socket.io-client';

const socket = io('http://127.0.0.1:5001', {
  auth: { token: accessToken },        // or send an Authorization: Bearer header
});

socket.on('room:status', (room) => {
  // { id, hotel_id, room_number, floor, status, is_active, deleted_at, updated_at }
});
```

- Every hotel user joins only the channel of their own hotel (`hotel:<hotel_id>`).
- `SUPER_ADMIN` must also pass `hotel_id` in `auth`.
- `room:status` is emitted when a booking is created (`OCCUPIED`), on check-out (`CLEANING`), when the
  status is changed through the API, and when cleaning finishes (`AVAILABLE`).
- Use Socket.IO client v4. A plain WebSocket client does not work.

---

## Scheduled Jobs

Registered in `routers/cronRouter.js` and handled by `controllers/cronController.js`.

| Job | Schedule | Action |
| :--- | :--- | :--- |
| `RoomCleaning` | Every minute | Rooms in `CLEANING` for the cleaning duration (20 minutes by default) become `AVAILABLE` |
| `PdfCleanup` | Every 3 hours | Deletes generated PDFs from `uploads/pdfs` |

Jobs run inside the API process. If you run several instances, they will each run the jobs.

---

## Postman Collection

- Import [`postman_collection.json`](postman_collection.json) (Collection v2.1).
- Log in or register a hotel first. Test scripts store the tokens in collection variables so the
  protected requests work without copy and paste.
- Regenerate the collection after changing any API: `npm run generate:postman`.

---

## Deployment

1. Set `NODE_ENV=production` and every variable marked required in [`.env.example`](.env.example).
2. Use strong, unique `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
3. Set `FRONTEND_URL` (and `RESET_PASSWORD_URL` if it differs) to the live frontend.
4. Run `npm run migrate` on every release. Run `npm run seed` once for the first Super Admin, then change its password.
5. Start with `npm start`. The server handles `SIGTERM` for graceful shutdown.
6. Puppeteer downloads Chromium on install. Linux containers need the usual Chromium system libraries for PDF generation.

---

## Contributing

1. Create a branch from the main branch (`feature/<name>` or `fix/<name>`).
2. Follow the [conventions](#architecture-and-conventions): keep controllers thin, business logic in services, SQL in models.
3. Add a validator for every new input and protect every route with `authenticateUser` and `requireRole`.
4. Add a new migration for schema changes. Do not edit existing ones.
5. Write short comments that explain why, not what. Remove commented-out code and debug logging.
6. Run `npm run generate:postman` and update this README when an endpoint changes.
7. Never commit `.env`, secrets or generated PDFs.

Code style: 2-space indentation, single quotes, semicolons, `const` over `let`, `async/await`, LF line endings.

---

## Troubleshooting

| Problem | Cause and fix |
| :--- | :--- |
| `Failed to connect database` on start | Check `DB_*` values and that MySQL is running and the database exists |
| Socket.IO client times out | Use `http://127.0.0.1:<port>` instead of `localhost`, pass the token in `auth.token`, and use client v4 |
| Reset link points to the live frontend | Run the local frontend on `localhost` (its origin is trusted) or set `RESET_PASSWORD_URL` |
| Emails are not delivered | Set `BREVO_API_KEY` and a verified `BREVO_SENDER_EMAIL`. Without a key emails are only logged |
| Redis connection warnings | Redis is optional. The in-memory queue is used when it is offline |
| Image upload fails | Check the `S3_*` variables and bucket permissions. Files must be images up to 10 MB each |
| PDF generation fails on a server | Install Chromium system libraries required by Puppeteer |
