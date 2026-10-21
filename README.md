# Hotel Management Backend

REST API for a multi-hotel property management system (PMS). It handles hotel onboarding, staff and
role management, room inventory, bookings with GST-aware billing, payment history, PDF folios and
live room status updates.

- **Runtime:** Node.js 18+ (20 LTS recommended), Express 4
- **Database:** MySQL 8+ through Knex (migrations and seeds)
- **Auth:** JWT access and refresh tokens (Bearer header or HTTP-only cookies), role-based access control
- **Real time:** Socket.IO (`room:status`, `room:status_breakdown`, and `room:category_counts` events)
- **Storage:** S3-compatible object storage for images (AWS S3, Cloudflare R2, MinIO)
- **Email:** Brevo transactional API, BullMQ queue with in-memory fallback
- **WhatsApp:** Cloud API booking confirmation, separate BullMQ queue with in-memory retry
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
| `FRONTEND_URL` | Yes | `http://localhost:3000` | CORS origin and the web app address used in every email link (welcome, staff invitation, password reset) |
| `RESET_PASSWORD_URL` | No | `FRONTEND_URL` | Overrides the address used in email links |
| `ADMIN_URL`, `WEB_URL` | No | - | Extra CORS origins only (for example the super admin console). Not used in email links |
| `ALLOWED_ORIGINS` | No | - | Extra CORS origins, comma separated |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `FROM_NAME` | No | - | Email delivery. Without a key, emails are only logged. The sender must be on your own authenticated domain. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | No | - | WhatsApp Cloud API sender. Without either value, booking confirmations are only logged. |
| `WHATSAPP_BOOKING_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | No | `booking_confirmation`, `en` | Approved template. Body variables, in order: guest name, hotel name, booking number, room details, check-in, check-out, total. |
| `WHATSAPP_ENABLED` | No | on when credentials exist | Set `false` to skip confirmation entirely. |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | No | `91` | Prefixed onto a 10-digit guest mobile. |
| `WHATSAPP_GRAPH_API_VERSION` | No | `v22.0` | Graph API version used for `/{phone-number-id}/messages`. |
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
├── queues/  workers/         # Email and WhatsApp queues (BullMQ + in-memory retry) and workers
├── templates/                # Email templates and the booking folio HTML
├── utils/                    # jwt, response/AppError, hotelScope, requestMeta, json, files, password, emailValidator
├── database/
│   ├── knex.js               # Shared Knex client
│   ├── migrations/           # Schema history. Never edit an applied migration
│   └── seeds/                # Seed data
├── scripts/                  # Tooling (Postman generator)
└── uploads/pdfs/             # Generated PDFs and Excel files (cleaned by a cron job)
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

Error (validation, `AppError` and database errors). `errors` is included only when a field failed:

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
| `HOTEL_ADMIN` | Full access to their own hotel: staff, rooms, room types, bookings, audit logs, hotel dashboard, GST report |
| `RECEPTIONIST` | Rooms, room types, bookings and front-desk dashboard of their own hotel |
| `MANAGER`, `HOUSEKEEPING`, `ACCOUNTANT` | Staff accounts created by a hotel admin (can log in, use real-time updates, and view the front-desk dashboard). `ACCOUNTANT` can also read the GST report |

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
| `GET` | `/auth/me` | Current user profile. A hotel admin also receives the full hotel and its subscription plan | Authenticated |
| `POST` | `/hotel/register` | Register a hotel and start the free trial (optional operational settings: check-in / check-out times, timezone, currency, tax, `gst_enabled`, UPI, amenities, policies) | Public |

### Own hotel (`HOTEL_ADMIN`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `PUT` | `/hotels/me` | Update the profile and operational settings of your own hotel (name, address, GST / PAN, `gst_enabled`, bank details, website, type, logo, `check_in_time`, `check_out_time`, `timezone`, `currency`, `tax_percentage`, `upi_id`, `late_checkout_grace_minutes`, `amenities`, `policies`). Sending `owner_email` or `owner_phone` returns `400`. Plan, `total_rooms` and active status are ignored. |

### Hotels (`SUPER_ADMIN` only)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/hotels` | Create a hotel and its owner account (multipart for the logo; same optional operational settings as register). The owner gets a welcome email. |
| `GET` | `/hotels` | List hotels (filters: `search`, `is_active`, `subscription_plan_id`, `subscription_plan_active`, `page`, `limit`, `sort_by`, `sort_order`) |
| `GET` | `/hotels/:id` | Hotel details with owner |
| `PUT` | `/hotels/:id` | Update details, logo, operational settings (`check_in_time`, `check_out_time`, timezone, currency, tax, `gst_enabled`, UPI, amenities, policies) and subscription |
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
| `POST` | `/subscription-plans/:id/purchase` | Buy that plan for your hotel. Price and dates come from the plan. An expired plan can still call this | `HOTEL_ADMIN` |

### Room types and rooms

| Method | Endpoint | Description | Access |
| :--- | :--- | :--- | :--- |
| `GET` | `/room-types` | List room types. Optional `page` (default 1) and `limit` (default 10, max 100). Each category includes `room_status_counts`. `room_status_summary` is the total across every category, not only the page. | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `GET` | `/room-types/:id` | Room type details | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `POST` | `/room-types` | Create room type (multipart for images) | `HOTEL_ADMIN` |
| `PUT` / `DELETE` | `/room-types/:id` | Update / delete | `HOTEL_ADMIN` |
| `GET` | `/rooms` | List (filters: `floor`, `room_type_id`, `status`, `is_active`, `page`, `limit`, `sort_by`, `sort_order`) | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `GET` | `/rooms/:id` | Room details | `HOTEL_ADMIN`, `RECEPTIONIST` |
| `POST` | `/rooms` | Create room. Status is always `AVAILABLE`. Optional `beds` is an array of `{ bed_type, bed_count }`. | `HOTEL_ADMIN` |
| `PUT` / `DELETE` | `/rooms/:id` | Update / soft delete (only `AVAILABLE` rooms). Update does not change status. Send `beds` to replace the bed list. | `HOTEL_ADMIN` |
| `PATCH` | `/rooms/:id/status` | Change room status | `HOTEL_ADMIN`, `RECEPTIONIST` |

Room statuses: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `CLEANING`, `MAINTENANCE`, `BLOCKED`.

`key_code` is optional on create and update (max 50 characters). Room list and room detail return it, or `null` when it was not set. An empty value clears it.

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

### Transactions (`HOTEL_ADMIN`, `RECEPTIONIST`, `MANAGER`, `ACCOUNTANT`, `SUPER_ADMIN`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/transactions` | Payment list for the token hotel. Optional `start_date` and `end_date` (`YYYY-MM-DD`) filter `created_at`, inclusive. Also `payment_method`, `status`, `source`, `booking_id`, `search`, `page`, `limit`, `sort_by`, `sort_order`. A super admin must send `hotel_id`. |

### Audit logs (`HOTEL_ADMIN`, `SUPER_ADMIN`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/audit-logs` | List (filters: `action`, `status`, `entity_type`, `entity_id`, `user_id`, `hotel_id` (super admin), `from_date`, `to_date`, `search`, `page`, `limit`, `sort_order`) |
| `GET` | `/audit-logs/:id` | One log entry |

### Dashboard (role auto-routing)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/dashboard` | Returns the dashboard for the caller's role. Optional `date_range` (`today`, `this_week`, `this_month`, `this_year`). Super admins may send `hotel_id` to open that hotel's dashboard. |
| `GET` | `/dashboard/summary` | Hotel totals for required `start_date` and `end_date` (`YYYY-MM-DD`). The response dates are `period_start_date` and `period_end_date` in `DD-MM-YYYY`, plus collected amount, collection by payment method, outstanding amount, booking count, guest count, booking amount, discount, extra charges, and late checkout charges. A super admin must send `hotel_id`. |

| Role | Dashboard |
| :--- | :--- |
| `SUPER_ADMIN` | Platform KPIs and plan distribution |
| `HOTEL_ADMIN` | Hotel revenue, occupancy, today's pulse, room status, payment mix, subscription quota |
| `RECEPTIONIST`, `MANAGER`, `HOUSEKEEPING`, `ACCOUNTANT` | Today's shift collections and room status summary |

Full request and response examples live in the [Postman collection](#postman-collection).

### GST report (`HOTEL_ADMIN`, `ACCOUNTANT`, `SUPER_ADMIN`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/reports/gst` | Invoice-wise GST report. Required: `start_date`, `end_date` (YYYY-MM-DD, inclusive). `end_date` can be at most one year after `start_date`; a longer range returns 400. Optional filters: `gst_rate`, `service_type` (`ROOM_BOOKING`; `OTHER_CHARGES` matches nothing), `invoice_status` (`FINAL`, `PROVISIONAL`, `CANCELLED`), `page`, `limit` (max 200). A super admin must also send `hotel_id`. |
| `GET` | `/reports/gst/export` | The same invoice lines as a file. `start_date`, `end_date` and `format=xlsx` or `format=pdf` are required. Both files contain only the invoice-wise table. Saved in `uploads/pdfs`, returns a download URL. There is no row cap; the one-year period is the limit. |

How the report is built from the existing data (there is no invoice table):

- One booking is one invoice and one row. Invoice number = booking number. Invoice date is shown as DD-MM-YYYY and is the
  actual check-out, or the scheduled check-out while the guest has not left. The payment date is never used. Query dates stay YYYY-MM-DD.
- Room rent, extra charges and the late check-out charge are included in the stored taxable value and GST. The report does
  not split an untaxed extras line. Tax is never recalculated, so a later rate change does not change an old report.
- A `CANCELLED` or `NO_SHOW` booking is reversed by a credit note for its taxable value. Net taxable value is the taxable
  value minus that credit note. Refunds (payments with status `REFUNDED`) are shown for information and do not change tax.
- Guest GSTIN, SAC, cess, line total and credit-note GST are not columns. IGST is not stored, so it is `0`. Every supply is treated as intra-state.

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
- When the hotel's subscription is switched off (`subscription.active` is false) or `subscription.end_date` has
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
taxable_amount = base_amount + extra_charges_total + late_checkout_charge - discount_amount
gst_amount     = taxable_amount x gst_rate / 100        (default 18%)
total_amount   = taxable_amount + gst_amount
due_amount     = total_amount - paid_amount
```

- GST applies to the room charge, extra charges, and the late checkout fee after the discount.
- `extra_charges_total`, `late_checkout_charge` and `late_checkout_hours` are accepted **only at check-out**. `discount_amount` is accepted on create, update, and check-out. At check-out a sent discount replaces the stored one; leaving it out keeps the booking discount.
- Check-out is rejected with 400 while any due remains after the payment collected in that request. The error `due_amount` is the balance left after extra charges, the late fee, the discount, and GST, minus what was already paid. The booking is not changed. Sending that amount completes checkout.
- After a booking is created, a WhatsApp template is queued to the guest mobile. The sender is the phone number in `WHATSAPP_PHONE_NUMBER_ID`. The hotel name and the other details come from that booking's `hotel_id`. A failed or skipped message does not change the `201` response. Retries run up to three times for network errors and rate limits. An invalid template or number is logged and not retried.
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

socket.on('room:category_counts', (payload) => {
  // {
  //   hotel_id,
  //   room_categories: [{ id, hotel_id, name, room_status_counts }],
  //   room_status_summary
  // }
});

socket.on('booking:updated', (booking) => {
  // Same object as GET /bookings/:id, including payment_history.
  // deleted_at is set when the booking was deleted.
});
```

- Every hotel user joins only the channel of their own hotel (`hotel:<hotel_id>`).
- `SUPER_ADMIN` must also pass `hotel_id` in `auth`.
- `room:status` is emitted when a booking is created (`OCCUPIED`), on check-out (`CLEANING`), when the
  status is changed through the API, and when cleaning finishes (`AVAILABLE`).
- Every `room:status` is followed by `room:status_breakdown` with live counts for that hotel. Use it to
  refresh dashboard room-status cards without polling.
- `room:category_counts` is sent when a room is created, updated, or deleted, and when a stay changes a
  room's status. `room_status_counts` and `room_status_summary` use the same keys as `GET /room-types`.
- `booking:updated` is sent to the same hotel channel when a booking is created, updated, checked out,
  has its status changed, or is deleted. The payload is the booking detail from `GET /bookings/:id`,
  including `payment_history`. A deleted booking includes `deleted_at`.
- Use Socket.IO client v4. A plain WebSocket client does not work.

---

## Scheduled Jobs

Registered in `routers/cronRouter.js` and handled by `controllers/cronController.js`.

| Job | Schedule | Action |
| :--- | :--- | :--- |
| `RoomCleaning` | Every minute | Rooms in `CLEANING` for the cleaning duration (20 minutes by default) become `AVAILABLE` |
| `PdfCleanup` | Every 3 hours | Deletes generated PDF and Excel files from `uploads/pdfs` |

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
| WhatsApp confirmation is not delivered | Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, and approve a template whose seven body variables match `.env.example`. A 10-digit mobile is prefixed with `WHATSAPP_DEFAULT_COUNTRY_CODE`. The booking is still created when the send fails. |
| Image upload fails | Check the `S3_*` variables and bucket permissions. Files must be images up to 10 MB each |
| PDF generation fails on a server | Install Chromium system libraries required by Puppeteer |
