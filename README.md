# Hotel Management Backend

REST API for a multi-hotel property management system (PMS). It handles hotel onboarding, staff and
role management, room inventory, bookings with GST-aware billing, payment history, PDF folios and
live room status updates.

- **Runtime:** Node.js 18+ (20 LTS recommended), Express 4
- **Database:** MySQL 8+ through Knex (migrations and seeds)
- **Auth:** JWT access and refresh tokens (Bearer header or HTTP-only cookies), role-based access control
- **Real time:** Socket.IO (`room:status` and `room:status_breakdown` events)
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
8. [Audit Trail](#audit-trail)
9. [Business Rules](#business-rules)
10. [Real-time Room Status (Socket.IO)](#real-time-room-status-socketio)
11. [Scheduled Jobs](#scheduled-jobs)
12. [Postman Collection](#postman-collection)
13. [Deployment](#deployment)
14. [Contributing](#contributing)
15. [Troubleshooting](#troubleshooting)

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
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `FROM_NAME` | No | - | Email delivery. Without a key, emails are only logged. The sender must be on your own authenticated domain. |
| `REPLY_TO_EMAIL` | No | `SUPPORT_EMAIL` | Reply-To address on every email |
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
├── utils/                    # jwt, response/AppError, hotelScope, requestMeta, json, files, password, emailValidator
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
| Controller | Reads the request, calls a service, returns `success(...)` for reads and `successMessage(...)` for create, update and delete |
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

Success with data (read APIs, login, hotel registration):

```json
{ "success": true, "message": "Booking retrieved successfully.", "data": {} }
```

Success with the record id (create, update, delete and status-change APIs). Use the list or get API
to read the saved record:

```json
{ "success": true, "message": "Booking updated successfully.", "data": { "id": 12 } }
```

Logout, reset-password and change-password return only `success` and `message`.

Error (validation, `AppError` and database errors):

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [{ "field": "email", "message": "Please enter a valid email address format" }]
}
```

When the hotel is deactivated, the same error shape also includes `"force_logout": true` and
`"code": "FORCE_LOGOUT"`. Auth cookies are cleared. The frontend should log the user out.

When the hotel's subscription plan is inactive or has ended, the error has `"code": "PLAN_INACTIVE"` or
`"code": "PLAN_EXPIRED"` (status `403`). The user is **not** logged out. The frontend should keep the session and
show a "renew your plan" screen.

Database constraint errors map to `409 Conflict` (duplicates) or `400` (foreign keys).

---

## Authentication and Roles

- Log in with `POST /api/v1/auth/login`. The response contains a Bearer access token and sets
  `accessToken` / `refreshToken` HTTP-only cookies.
- Send the token as `Authorization: Bearer <access_token>`, or rely on the cookie in browsers.
- Renew with `POST /api/v1/auth/refresh-token`.

| Role | Access |
| :--- | :--- |
| `SUPER_ADMIN` | Platform owner. Manages hotels and subscription plans. Reads audit logs of every hotel. |
| `HOTEL_ADMIN` | Full access to their own hotel: staff, rooms, room types, bookings, audit logs, hotel dashboard |
| `RECEPTIONIST` | Rooms, room types, bookings and front-desk dashboard of their own hotel |
| `MANAGER`, `HOUSEKEEPING`, `ACCOUNTANT` | Staff accounts created by a hotel admin (can log in, use real-time updates, and view the front-desk dashboard) |

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

### Hotels (`SUPER_ADMIN` only)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/hotels` | Create a hotel and its owner account (multipart for the logo). The owner gets a welcome email. |
| `GET` | `/hotels` | List hotels (filters: `search`, `is_active`, `subscription_plan_id`, `subscription_plan_active`, `page`, `limit`, `sort_by`, `sort_order`) |
| `GET` | `/hotels/:id` | Hotel details with owner |
| `PUT` | `/hotels/:id` | Update details, logo and subscription |
| `PATCH` | `/hotels/:id/active-status` | Switch a hotel on or off with `{ "is_active": true \| false }` |
| `DELETE` | `/hotels/:id` | Soft delete the hotel and its users (they can no longer sign in) |

### Subscription plans

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/subscription-plans` | List plans | Public |
| `GET` | `/subscription-plans/:id` | Plan with features | Public |
| `POST` | `/subscription-plans` | Create a plan | `SUPER_ADMIN` |
| `PUT` | `/subscription-plans/:id` | Update a plan | `SUPER_ADMIN` |
| `DELETE` | `/subscription-plans/:id` | Archive a plan | `SUPER_ADMIN` |

### Room types and rooms

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/room-types` | List room types | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `GET` | `/room-types/:id` | Room type details | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `POST` | `/room-types` | Create room type (multipart for images) | `HOTEL_ADMIN` |
| `PUT` / `DELETE` | `/room-types/:id` | Update / delete | `HOTEL_ADMIN` |
| `GET` | `/rooms` | List (filters: `floor`, `room_type_id`, `status`, `is_active`, `page`, `limit`, `sort_by`, `sort_order`) | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `GET` | `/rooms/:id` | Room details | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `POST` | `/rooms` | Create room | `HOTEL_ADMIN` |
| `PUT` / `DELETE` | `/rooms/:id` | Update / soft delete (only `AVAILABLE` rooms) | `HOTEL_ADMIN` |
| `PATCH` | `/rooms/:id/status` | Change room status | `HOTEL_ADMIN`, `RECEPTIONIST` |

Room statuses: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `CLEANING`, `MAINTENANCE`, `BLOCKED`.

### Bookings (`HOTEL_ADMIN`, `RECEPTIONIST`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/bookings` | Create a booking (multipart for guest ID images) |
| `GET` | `/bookings` | Paginated list: `id`, `hotel_id`, `booking_number`, `primary_guest_name`, `mobile_number`, `booking_status`, `rooms` |
| `GET` | `/bookings/:id` | Full booking including `payment_history` |
| `GET` | `/bookings/:id/pdf` | Generate the folio PDF |
| `GET` | `/bookings/:id/bill` | Generate the guest tax-invoice bill PDF |
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

### Audit logs (`HOTEL_ADMIN`, `SUPER_ADMIN`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/audit-logs` | List (filters: `action`, `status`, `entity_type`, `entity_id`, `user_id`, `hotel_id` (super admin), `from_date`, `to_date`, `search`, `page`, `limit`, `sort_order`) |
| `GET` | `/audit-logs/:id` | One log entry |

### Dashboard (role auto-routing)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/dashboard` | Returns the dashboard for the caller's role. Optional `date_range` (`today`, `this_week`, `this_month`, `this_year`). Super admins may send `hotel_id` to open that hotel's dashboard. |

| Role | Dashboard |
| :--- | :--- |
| `SUPER_ADMIN` | Platform KPIs and plan distribution |
| `HOTEL_ADMIN` | Hotel revenue, occupancy, today's pulse, room status, payment mix, subscription quota |
| `RECEPTIONIST`, `MANAGER`, `HOUSEKEEPING`, `ACCOUNTANT` | Today's shift collections and room status summary |

Full request and response examples live in the [Postman collection](#postman-collection).

---

## Audit Trail

Every important change is written to the `audit_logs` table by the service layer. The table is
append-only. The API is read-only.

| Column | Meaning |
| :--- | :--- |
| `hotel_id` | Hotel the action belongs to (null for platform-level actions) |
| `user_id`, `user_name`, `user_role` | Who did it, stored as a snapshot |
| `action` | `CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `CHECK_OUT`, `LOGIN`, `LOGIN_FAILED`, `PASSWORD_RESET` |
| `status` | `SUCCESS`, or `FAILED` when the action was rejected or hit an error |
| `status_code`, `error_message`, `error_details` | For `FAILED` rows: the HTTP status, the reason (the real cause for a server error), and field errors. Null for `SUCCESS` |
| `entity_type`, `entity_id` | `HOTEL`, `USER`, `SUBSCRIPTION_PLAN`, `ROOM_TYPE`, `ROOM`, `BOOKING` and the record id |
| `description` | Short readable summary |
| `changes` | JSON `{ field: { from, to } }` with only the fields that changed |
| `request_data` | JSON of the data the caller sent (body fields and uploaded file names and sizes). Passwords, tokens and secrets are stored as `[REDACTED]`. `hotel_id` is left out for non-super-admins because it comes from the token. Null when nothing was sent. |
| `ip_address`, `user_agent` | Caller details |

- A `HOTEL_ADMIN` sees only the logs of their own hotel. A `SUPER_ADMIN` sees every hotel.
- Failed changes are recorded too. The global error handler writes a `FAILED` row for any POST, PUT,
  PATCH or DELETE that ends in an error, when the caller is signed in (validation errors, 403, 404,
  409 and server errors). Failed logins for an existing account are `LOGIN_FAILED` rows with the
  reason. Unauthenticated calls and GET errors are not recorded, so an anonymous caller cannot fill
  the table. Filter with `status=FAILED`.
- Passwords are never stored. Logout and automatic jobs (for example cleaning timers) are not recorded.
- Recording never breaks the request. If the insert fails, the error is logged and the API still succeeds.
- To audit a new action, call `auditService.record()` from the service after the change succeeds.
  Use `auditService.diffChanges(before, updates)` for the `changes` value, and add new action or
  entity names to `AUDIT_ACTIONS` / `AUDIT_ENTITIES` in `constants/`.

---

## Business Rules

**Booking and rooms**

- Creating a room is limited by the hotel's subscription plan. It returns `403` when the hotel already
  has `max_rooms` rooms (deleted rooms are not counted). Updating and deleting rooms is not affected.
- A new booking defaults to `CHECKED_IN` and sets its rooms to `OCCUPIED`.
- A room cannot be booked twice for overlapping dates. `CHECKED_OUT`, `CANCELLED` and `NO_SHOW` stays do not block dates.
- After check-out the room becomes `CLEANING`, then `AVAILABLE` again automatically (see [Scheduled Jobs](#scheduled-jobs)).
- Deleted rooms still show their number, floor and type on past bookings.

**Hotel active status and subscription access**

- Every hotel starts with `is_active = true`. A super admin can switch it off with `PATCH /hotels/:id/active-status`.
- While a hotel is off, all of its users get `403` on login, refresh token, password reset and every protected API (even with a token issued earlier), and their sockets are disconnected. Nothing is deleted.
- When the hotel's subscription plan is switched off (`subscription_plan_active = false`) or its end date has
  passed, every protected API returns `403` with `"code": "PLAN_INACTIVE"` or `"code": "PLAN_EXPIRED"` and a message
  asking the user to renew. The user stays signed in: login, refresh-token, logout and password reset still work,
  so the frontend can show a renew screen. Super admins are never blocked and can renew the plan with
  `PUT /hotels/:id`. A missing end date means the plan never expires.
- A deactivated hotel is stricter: the block also applies to login, refresh-token and password reset, auth cookies
  are cleared like `POST /auth/logout`, and the error includes `"force_logout": true` and `"code": "FORCE_LOGOUT"`.
  The frontend should clear local tokens and redirect to login.
- Switching the hotel or plan back on restores access.

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

socket.on('room:status_breakdown', (payload) => {
  // {
  //   hotel_id,
  //   room_status_breakdown: {
  //     AVAILABLE, OCCUPIED, RESERVED, CLEANING, MAINTENANCE, BLOCKED
  //   }
  // }
});
```

- Every hotel user joins only the channel of their own hotel (`hotel:<hotel_id>`).
- `SUPER_ADMIN` must also pass `hotel_id` in `auth`.
- `room:status` is emitted when a booking is created (`OCCUPIED`), on check-out (`CLEANING`), when the
  status is changed through the API, and when cleaning finishes (`AVAILABLE`).
- Every `room:status` is followed by `room:status_breakdown` with live counts for that hotel. Use it to
  refresh dashboard room-status cards without polling.
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
| Emails go to spam or arrive late | Do not use a gmail/yahoo/outlook address as `BREVO_SENDER_EMAIL`. Use an address on your own domain and add the SPF, DKIM and DMARC records Brevo shows under Senders, Domains & Dedicated IPs. The server logs a warning at the first send when the sender is a free-mail address |
| Redis connection warnings | Redis is optional. The in-memory queue is used when it is offline |
| Image upload fails | Check the `S3_*` variables and bucket permissions. Files must be images up to 10 MB each |
| PDF generation fails on a server | Install Chromium system libraries required by Puppeteer |
