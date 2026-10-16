/**
 * Builds a Postman Collection v2.1 file the frontend team can import directly.
 * Every request key is listed in the body or query, and explained in the request description.
 *
 * Run: npm run generate:postman
 */
const fs = require('fs');
const path = require('path');

const NO_AUTH = { type: 'noauth' };

const jsonHeaders = () => [
  { key: 'Content-Type', value: 'application/json', type: 'text' },
  { key: 'Accept', value: 'application/json', type: 'text' },
];

const acceptHeader = () => [
  { key: 'Accept', value: 'application/json', type: 'text' },
];

const jsonBody = (value) => ({
  mode: 'raw',
  raw: JSON.stringify(value, null, 2),
  options: { raw: { language: 'json' } },
});

const queryParam = (key, value, description, disabled = false) => {
  const item = { key, value, description };
  if (disabled) item.disabled = true;
  return item;
};

const textField = (key, value, description, disabled = false) => {
  const item = { key, value, type: 'text', description };
  if (disabled) item.disabled = true;
  return item;
};

const fileField = (key, description) => ({
  key,
  type: 'file',
  src: [],
  description,
});

const buildUrl = (raw, pathSegments, query = [], variable = []) => {
  const url = {
    raw,
    host: ['{{baseUrl}}'],
    path: pathSegments,
  };
  if (query.length) url.query = query;
  if (variable.length) url.variable = variable;
  return url;
};

const testScript = (lines) => ([
  {
    listen: 'test',
    script: { type: 'text/javascript', exec: lines },
  },
]);

const saveTokens = [
  "const body = pm.response.json();",
  "const data = body && body.data ? body.data : {};",
  "const token = data.access_token || (data.auth && data.auth.access_token);",
  "if (token) pm.collectionVariables.set('accessToken', token);",
  "if (data.refresh_token) pm.collectionVariables.set('refreshToken', data.refresh_token);",
  "const user = data.user || data.admin;",
  "if (user && user.id) pm.collectionVariables.set('userId', String(user.id));",
  "if (user && user.hotel_id) pm.collectionVariables.set('hotelId', String(user.hotel_id));",
  "if (data.hotel && data.hotel.id) pm.collectionVariables.set('hotelId', String(data.hotel.id));",
];

// Closing note for logout and password APIs. These return no data.
const messageOnlyNote = (hint = '') => `**Response:** only \`success\` and \`message\`. There is no \`data\`.${hint ? ` ${hint}` : ''}`;

// Closing note for create, update and delete requests. These return only the id of the record.
const idNote = (hint = '') => `**Response:** \`success\`, \`message\`, and \`data.id\` (the id of the created, updated, or deleted record).${hint ? ` ${hint}` : ''}`;

const saveId = (dataPath, variableName) => [
  "const body = pm.response.json();",
  "let value = body && body.data;",
  ...dataPath.split('.').filter(Boolean).map((part) => `if (value) value = value${/^\d+$/.test(part) ? `[${part}]` : `.${part}`};`),
  "if (value !== undefined && value !== null && value !== '') {",
  `    pm.collectionVariables.set('${variableName}', String(value));`,
  "}",
];

const envelope = `
Every response uses the same envelope.

Success with data (read APIs):
\`\`\`json
{ "success": true, "message": "Human readable message", "data": {} }
\`\`\`

Success with the record id (create, update and delete APIs):
\`\`\`json
{ "success": true, "message": "Human readable message", "data": { "id": 12 } }
\`\`\`

Error:
\`\`\`json
{ "success": false, "message": "First error", "errors": [{ "field": "email", "message": "Why this field failed" }] }
\`\`\`
`;

const authNote = (who) => `**Who can call this:** ${who}

Send the access token as \`Authorization: Bearer {{accessToken}}\`. Login stores that token in the collection variable automatically. The hotel is read from the logged-in user. Do not send \`hotel_id\` to choose a hotel. A hotel admin or receptionist always works inside their own hotel.`;

const item = ({
  name,
  method,
  raw,
  pathSegments,
  description,
  query = [],
  variable = [],
  body,
  auth,
  headers,
  events,
}) => ({
  name,
  ...(events ? { event: events } : {}),
  request: {
    method,
    header: headers || (body && body.mode === 'raw' ? jsonHeaders() : acceptHeader()),
    ...(auth ? { auth } : {}),
    ...(body ? { body } : {}),
    url: buildUrl(raw, pathSegments, query, variable),
    description,
  },
});

const idVar = (key, value, description) => ({ key, value, description });

const collection = {
  info: {
    _postman_id: 'hotel-management-api-v1',
    name: 'Hotel Management API',
    description: `# Hotel Management API

Import this file in Postman with **File → Import**. No environment file is required. Collection variables are included.

## Start here
1. Set \`baseUrl\` if the server is not on \`http://localhost:5000\`.
2. Run **Authentication → Login**.
3. The test script saves \`accessToken\`, \`refreshToken\`, \`userId\`, and \`hotelId\`.
4. Protected requests reuse \`{{accessToken}}\` as a Bearer token.

Seeded platform admin, after \`npm run seed\`:
- Email: \`admin@hotel.com\`
- Password: \`Admin@123\`
- Role: \`SUPER_ADMIN\`

## Base URL
Use \`{{baseUrl}}/api/v1/...\`. The same routes also answer on \`{{baseUrl}}/api/...\`.

These pairs hit the same router. This collection uses the plural path:
| Use this | Same router |
| --- | --- |
| \`/api/v1/hotels\` | \`/api/v1/hotel\` |
| \`/api/v1/rooms\` | \`/api/v1/room\` |
| \`/api/v1/bookings\` | \`/api/v1/booking\` |
| \`/api/v1/users\` | \`/api/v1/user\` |

## Auth and hotel scope
- Public routes do not need a token.
- Protected routes need \`Authorization: Bearer <access_token>\`.
- The token carries the user id. The server loads that user and uses \`user.hotel_id\`.
- \`hotel_id\` in a body or query does not switch hotels for a hotel admin or receptionist.
- Only a super admin may pass \`hotel_id\` when creating or filtering staff.
- \`requireRole\` allows \`SUPER_ADMIN\` in addition to the roles named on that folder.

## Roles
| Role | What they can call in this API |
| --- | --- |
| \`SUPER_ADMIN\` | Hotels management (create, list, update, delete), plans write APIs, staff APIs, and the hotel modules |
| \`HOTEL_ADMIN\` | Rooms, room categories, bookings, and staff of their hotel |
| \`RECEPTIONIST\` | Rooms, room categories, and bookings of their hotel |
| \`MANAGER\`, \`HOUSEKEEPING\`, \`ACCOUNTANT\` | Accounts can be created. These routes return 403 for them |

## Response envelope
${envelope}

Dates are ISO 8601 strings. Send dates as \`2026-10-14\` or \`2026-10-14T14:00:00.000Z\`.

## Files
Image uploads use \`multipart/form-data\`. Allowed types: JPEG, PNG, WebP, GIF, SVG, AVIF. Max 10 MB per file. There is no limit on the number of files in one request. When there is no file, the same text keys can be sent as JSON.
`,
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000', type: 'string', description: 'API server origin, without a trailing slash. Local default is http://localhost:5000.' },
    { key: 'accessToken', value: '', type: 'string', description: 'JWT access token. Login and hotel registration save data.access_token here. Send it as Authorization: Bearer {{accessToken}}.' },
    { key: 'refreshToken', value: '', type: 'string', description: 'JWT refresh token from data.refresh_token. Send it as refresh_token in the refresh request body. The cookie name is refreshToken.' },
    { key: 'hotelId', value: '', type: 'string', description: 'Hotel id of the logged-in user. Saved from login or hotel registration. The server reads the hotel from the token, so this is for display and for the super admin staff filter.' },
    { key: 'roomTypeId', value: '', type: 'string', description: 'Room category id. Saved from the create response, or run List room categories to save the first id here.' },
    { key: 'roomId', value: '', type: 'string', description: 'Physical room id. Saved from the create response, or run List rooms to save the first id here.' },
    { key: 'bookingId', value: '', type: 'string', description: 'Booking id. Saved from the create response, or run List bookings to save the first id here.' },
    { key: 'userId', value: '', type: 'string', description: 'Staff user id. Saved from login, or run List staff users to save the first id here.' },
    { key: 'targetHotelId', value: '', type: 'string', description: 'Hotel id used by the super admin Hotels folder. Saved from the create response, or run List hotels to save the first id here.' },
    { key: 'planId', value: '', type: 'string', description: 'Subscription plan id. Saved from the create response, or run List plans to save the first id here.' },
    { key: 'auditLogId', value: '', type: 'string', description: 'Audit log id. Run List audit logs to save the first id here.' },
    { key: 'resetToken', value: '', type: 'string', description: 'Password reset token from the email link, or from data.resetUrl in non-production forgot-password responses. Paste the token value only, not the full URL.' },
  ],
  auth: {
    type: 'bearer',
    bearer: [
      { key: 'token', value: '{{accessToken}}', type: 'string' },
    ],
  },
  item: [],
};

const healthFolder = {
  name: '01 Health',
  description: 'Public checks. No token. Use these to confirm the server is up before calling other APIs.',
  item: [
    item({
      name: 'Server health',
      method: 'GET',
      auth: NO_AUTH,
      raw: '{{baseUrl}}/health',
      pathSegments: ['health'],
      description: `### GET /health
Public. Confirms the Node process is accepting HTTP.

No query keys. No body.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`status\` | string | \`"UP"\` when the process is running |`,
    }),
    item({
      name: 'API health',
      method: 'GET',
      auth: NO_AUTH,
      raw: '{{baseUrl}}/api/health',
      pathSegments: ['api', 'health'],
      description: `### GET /api/health
Public. Same payload as \`GET /health\`. Confirms the \`/api\` prefix is mounted.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`status\` | string | \`"UP"\` |`,
    }),
  ],
};

const authFolder = {
  name: '02 Authentication',
  description: `Login, refresh, logout, password reset, and the current profile.

Token response keys are snake_case: \`access_token\` and \`refresh_token\`.
The browser cookies are camelCase: \`accessToken\` and \`refreshToken\`.
Postman should use the Bearer token from the JSON body. Login saves it for the rest of this collection.

${envelope}`,
  item: [
    item({
      name: 'Login',
      method: 'POST',
      auth: NO_AUTH,
      events: testScript(saveTokens),
      raw: '{{baseUrl}}/api/v1/auth/login',
      pathSegments: ['api', 'v1', 'auth', 'login'],
      body: jsonBody({
        email: 'admin@hotel.com',
        password: 'Admin@123',
      }),
      description: `### POST /api/v1/auth/login
Public. Checks email and password, sets HTTP-only cookies, and returns both tokens in \`data\`.

After 15 failed attempts the account is locked for 1 minute.

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`email\` | string | Yes | Account email. Stored and compared in lowercase. |
| \`password\` | string | Yes | Account password. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`access_token\` | string | Short-lived JWT. Send as \`Authorization: Bearer <access_token>\`. |
| \`refresh_token\` | string | Long-lived JWT. Send later as \`refresh_token\`. |
| \`user.id\` | number | User id. |
| \`user.name\` | string | Display name. |
| \`user.email\` | string | Login email. |
| \`user.role\` | string | \`SUPER_ADMIN\`, \`HOTEL_ADMIN\`, \`RECEPTIONIST\`, \`MANAGER\`, \`HOUSEKEEPING\`, or \`ACCOUNTANT\`. |
| \`user.phone\` | string | Phone. Empty string when missing. |
| \`user.hotel_id\` | number or null | Hotel this user belongs to. Null for super admin. |
| \`user.is_active\` | boolean | \`false\` means the account cannot sign in. |
| \`user.is_disabled\` | boolean | \`true\` means the account cannot sign in and cannot call any protected API. |
| \`hotel\` | object or null | The user's hotel. Null for super admin. |
| \`hotel.id\` | number | Hotel id. |
| \`hotel.name\` | string | Hotel name. |
| \`hotel.gst_number\` | string | Hotel GST number. Empty string when not set. |
| \`hotel.pan_number\` | string | Hotel PAN number. Empty string when not set. |

The password is never returned.`,
    }),
    item({
      name: 'Refresh access token',
      method: 'POST',
      auth: NO_AUTH,
      events: testScript(saveTokens),
      raw: '{{baseUrl}}/api/v1/auth/refresh-token',
      pathSegments: ['api', 'v1', 'auth', 'refresh-token'],
      body: jsonBody({
        refresh_token: '{{refreshToken}}',
      }),
      description: `### POST /api/v1/auth/refresh-token
Public. Issues a new access token and a new refresh token.

If the hotel is deactivated, this returns 403 with \`force_logout: true\` and \`code: "FORCE_LOGOUT"\`, clears auth cookies, and does not issue new tokens. The frontend should clear local tokens and send the user to login. An inactive or expired subscription plan does not block refresh: the user stays signed in and the protected APIs return \`code: "PLAN_INACTIVE"\` or \`"PLAN_EXPIRED"\`.

The body key is \`refresh_token\` (snake_case). A browser may instead send the \`refreshToken\` cookie. Postman should send the body key.

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`refresh_token\` | string | Yes in Postman | Value returned as \`data.refresh_token\` at login. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`access_token\` | string | New access token. Replaces the collection variable. |
| \`refresh_token\` | string | New refresh token. Use this on the next refresh. |
| \`user.id\` | number | User id. |
| \`user.name\` | string | Display name. |
| \`user.email\` | string | Login email. |
| \`user.role\` | string | Role code. |
| \`user.hotel_id\` | number or null | Hotel on the account. |
| \`user.is_active\` | boolean | Account active flag. |`,
    }),
    item({
      name: 'Logout',
      method: 'POST',
      auth: NO_AUTH,
      raw: '{{baseUrl}}/api/v1/auth/logout',
      pathSegments: ['api', 'v1', 'auth', 'logout'],
      description: `### POST /api/v1/auth/logout
Public. Clears the \`accessToken\` and \`refreshToken\` cookies.

No body. No query keys.

${messageOnlyNote()}

The Bearer token already issued is not stored server-side. The frontend should also drop \`access_token\` and \`refresh_token\` from memory after logout.`,
    }),
    item({
      name: 'Forgot password',
      method: 'POST',
      auth: NO_AUTH,
      raw: '{{baseUrl}}/api/v1/auth/forgot-password',
      pathSegments: ['api', 'v1', 'auth', 'forgot-password'],
      body: jsonBody({
        email: 'admin@hotel.com',
      }),
      description: `### POST /api/v1/auth/forgot-password
Public. Sends a single-use reset link. The link expires in 30 minutes. Older unused tokens for that user are cancelled.

Unknown email returns 404. A deactivated account returns 403.

**Where the link points.** The server adds \`/reset-password?token=...\` to a frontend address. When the request comes from a frontend on \`localhost\` or \`127.0.0.1\` (any port), the browser sends that address in the \`Origin\` header and the link points back to it, so a developer using the live API stays on their local app. Any other caller, including Postman, gets the address in the server setting \`RESET_PASSWORD_URL\` or \`FRONTEND_URL\`. Only localhost is trusted from the request.

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`email\` | string | Yes | Registered email. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`email\` | string | Address the link was sent to. |
| \`resetUrl\` | string | Present only when \`NODE_ENV\` is not \`production\`. Copy the \`token\` query value into \`{{resetToken}}\`. |`,
    }),
    item({
      name: 'Reset password',
      method: 'POST',
      auth: NO_AUTH,
      raw: '{{baseUrl}}/api/v1/auth/reset-password',
      pathSegments: ['api', 'v1', 'auth', 'reset-password'],
      body: jsonBody({
        token: '{{resetToken}}',
        password: 'NewPass@123',
      }),
      description: `### POST /api/v1/auth/reset-password
Public. Sets a new password with the email token. The token can be used once.

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`token\` | string | Yes | Token from the reset link. Not the full URL. |
| \`password\` | string | Yes | New password. Minimum 6 characters. |

${messageOnlyNote('Then call Login with the new password.')}`,
    }),
    item({
      name: 'Current profile',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/auth/me',
      pathSegments: ['api', 'v1', 'auth', 'me'],
      description: `### GET /api/v1/auth/me
${authNote('Any logged-in role.')}

No query keys. No body. Use this after login to know the role and hotel before showing screens.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | User id. |
| \`name\` | string | Display name. |
| \`email\` | string | Login email. |
| \`phone\` | string | Phone. |
| \`role\` | string | Role code. |
| \`hotel_id\` | number or null | Hotel on the account. Use this as the active property. |
| \`is_active\` | boolean | Account active flag. \`false\` blocks login. |
| \`is_disabled\` | boolean | \`false\` by default. \`true\` blocks login and every protected API. |
| \`must_change_password\` | boolean | \`true\` when the account was created with a temporary password. |
| \`last_login_at\` | string or null | Last successful login. |
| \`created_at\` | string | Account created time. |
| \`updated_at\` | string | Account updated time. |
| \`hotel\` | object or null | Null for a super admin. A hotel admin receives the full hotel (same keys as **Get hotel**) plus \`subscription.plan\`. Every other hotel role receives the short summary: \`id\`, \`name\`, \`gst_number\`, \`pan_number\`. |

**\`subscription.plan\`** (hotel admin only, null when the hotel has no plan)
| Key | Meaning |
| --- | --- |
| \`id\`, \`name\`, \`code\` | Plan id, name, and code (for example \`TRIAL\`). |
| \`billingCycle\` | \`MONTHLY\` or \`ANNUAL\`. |
| \`price\`, \`discountPercent\`, \`maxRooms\` | Price, discount, and room limit. |
| \`description\`, \`badge\` | Plan text. |
| \`isPopular\`, \`isActive\`, \`displayOrder\` | Catalog flags. |
| \`features\` | String array. |
| \`createdAt\`, \`updatedAt\`, \`deletedAt\` | Plan timestamps. \`deletedAt\` is set when the plan was archived. |`,
    }),
  ],
};

const hotelSettingsFormFields = () => [
  textField('check_in_time', '14:00', 'Optional. HH:mm 24-hour. Default 14:00 on create. Stored in hotel.settings.check_in_time.'),
  textField('check_out_time', '12:00', 'Optional. HH:mm 24-hour. Default 12:00 on create. Stored in hotel.settings.check_out_time.'),
  textField('timezone', 'Asia/Kolkata', 'Optional. Max 50 characters. Default Asia/Kolkata on create.'),
  textField('currency', 'INR', 'Optional. 3 to 10 characters. Default INR on create.'),
  textField('tax_percentage', '18', 'Optional. Number from 0 to 100. Default 18 on create. Stored in hotel.settings.tax_percentage.'),
  textField('gst_enabled', 'true', 'Optional. true or false. Stored in hotel.settings.gst_enabled. On create, when omitted, GST is on only if a GST number was sent. On update, send true or false to change it.'),
  textField('upi_id', 'seaside@upi', 'Optional. UPI id for payments. Max 100. Empty clears it. Stored in hotel.settings.upi_id.'),
  textField('late_checkout_grace_minutes', '10', 'Optional. Integer 0 to 1440. Default 10 on create.'),
  textField('amenities', '["Free WiFi","24/7 Room Service","Air Conditioning"]', 'Optional. JSON array or comma-separated list. Stored in hotel.settings.amenities.'),
  textField('policies', '["Valid Government ID required at check-in","No smoking in standard rooms"]', 'Optional. JSON array or comma-separated list. Stored in hotel.settings.policies.'),
];

const hotelSettingsBodyKeysDoc = `| \`check_in_time\` | string | HH:mm 24-hour. Default \`14:00\` on create. |
| \`check_out_time\` | string | HH:mm 24-hour. Default \`12:00\` on create. |
| \`timezone\` | string | Max 50. Default \`Asia/Kolkata\` on create. |
| \`currency\` | string | 3 to 10 chars. Default \`INR\` on create. |
| \`tax_percentage\` | number | 0 to 100. Default \`18\` on create. |
| \`gst_enabled\` | boolean | true or false. Returned in \`settings.gst_enabled\`. On create, omitted means true only when a GST number was sent. On update, send it to change the stored value. Omitting it leaves the current value. |
| \`upi_id\` | string | UPI id. Max 100. Empty clears it. |
| \`late_checkout_grace_minutes\` | number | Integer 0 to 1440. Default \`10\` on create. |
| \`amenities\` | string / array | JSON array or comma-separated list. |
| \`policies\` | string / array | JSON array or comma-separated list. |`;

// Form-data for Register hotel and Create hotel. Every accepted field is listed. Optional fields are enabled.
const hotelProvisionFormFields = () => [
  textField('name', 'Seaside Residency', 'Required. Property name. Max 150 characters. A URL slug is generated from this.'),
  textField('owner_name', 'Asha Patel', 'Required. Owner or general manager name. Max 150 characters. This becomes the hotel admin display name.'),
  textField('owner_email', 'owner@seaside.example', 'Required. Hotel admin login email. Must be unique among active users.'),
  textField('owner_phone', '9876543210', 'Required. Indian mobile. 10 digits starting with 6, 7, 8, or 9. +91 and leading 0 are stripped.'),
  textField('address', '12 Marine Drive', 'Required. Street address.'),
  textField('city', 'Mumbai', 'Required. Max 100 characters.'),
  textField('state', 'Maharashtra', 'Required. Max 100 characters.'),
  textField('country', 'India', 'Optional. Defaults to India. Max 100 characters.'),
  textField('pincode', '400001', 'Required. 6-digit Indian PIN code.'),
  textField('gst_number', '27AAAAA0000A1Z5', 'Optional. 15-character GSTIN (e.g. 27AAAAA0000A1Z5). Empty is allowed. Stored uppercase. When gst_enabled is omitted, a GST number turns GST on.'),
  textField('pan_number', 'AAAAA0000A', 'Optional. 10-character PAN (e.g. AAAAA0000A). Empty is allowed. Stored uppercase.'),
  textField('bank_name', 'HDFC Bank', 'Optional. Bank name printed on bills and folios. Max 150 characters.'),
  textField('bank_account_holder', 'Seaside Residency', 'Optional. Account holder name. Max 150 characters.'),
  textField('bank_account_number', '123456789012', 'Optional. 9 to 18 digits.'),
  textField('bank_ifsc_code', 'HDFC0001234', 'Optional. 11-character IFSC code. Stored uppercase.'),
  textField('bank_branch', 'Marine Drive, Mumbai', 'Optional. Branch name. Max 150 characters.'),
  textField('total_rooms', '24', 'Optional. Whole number, 0 or more. Inventory count only. It does not create rooms.'),
  textField('hotel_type', 'Boutique Hotel', 'Optional. Free text, max 100 characters. Example: Boutique Hotel, Resort, Lodge.'),
  textField('website', 'https://seaside.example', 'Optional. Valid URL. A missing http:// is accepted and treated as https.'),
  ...hotelSettingsFormFields(),
  fileField('logo', 'Optional file. Field name logo, logo_image, or file. JPEG, PNG, WebP, GIF, SVG, or AVIF. Max 10 MB.'),
  textField('subscription_plan_id', '{{planId}}', 'Optional. Plan id from Subscription Plans. Empty assigns the plan whose code is TRIAL.'),
  textField('subscription_plan_active', 'true', 'Optional. true or false. Defaults to true.'),
  textField('subscription_plan_start_date', '2026-10-14', 'Optional. ISO date (YYYY-MM-DD). Defaults to the trial start (now).'),
  textField('subscription_plan_end_date', '2026-11-13', 'Optional. ISO date. Defaults to 30 days after registration.'),
];

const hotelProvisionBodyKeysDoc = `**Required body keys**
| Key | Type | Meaning |
| --- | --- | --- |
| \`name\` | string | Property name. Max 150. A URL slug is generated from this. |
| \`owner_name\` | string | Owner / general manager name. Max 150. Becomes the hotel admin display name. |
| \`owner_email\` | string | Hotel admin login email. Must be unique among active users. |
| \`owner_phone\` | string | Indian mobile. 10 digits starting with 6–9. |
| \`address\` | string | Street address. |
| \`city\` | string | Max 100. |
| \`state\` | string | Max 100. |
| \`pincode\` | string | 6-digit Indian PIN code. |

**Optional body keys** (all included and enabled on the Body form-data rows)
| Key | Type | Meaning |
| --- | --- | --- |
| \`country\` | string | Defaults to India. Max 100. |
| \`gst_number\` | string | 15-character GSTIN. Empty allowed. Stored uppercase. When \`gst_enabled\` is omitted, a GST number turns GST on. |
| \`pan_number\` | string | 10-character PAN. Empty allowed. Stored uppercase. |
| \`bank_name\` | string | Bank name on bills and folios. Max 150. |
| \`bank_account_holder\` | string | Account holder name. Max 150. |
| \`bank_account_number\` | string | 9 to 18 digits. |
| \`bank_ifsc_code\` | string | 11-character IFSC. Stored uppercase. |
| \`bank_branch\` | string | Branch name. Max 150. |
| \`total_rooms\` | number | Whole number, 0 or more. Does not create rooms. |
| \`hotel_type\` | string | Free text, max 100. |
| \`website\` | string | Valid URL. |
${hotelSettingsBodyKeysDoc}
| \`logo\` | file | Field name \`logo\`, \`logo_image\`, or \`file\`. Max 10 MB. |
| \`subscription_plan_id\` | number | Plan id. Empty assigns the plan whose code is \`TRIAL\`. |
| \`subscription_plan_active\` | boolean | true or false. Defaults to true. |
| \`subscription_plan_start_date\` | string | ISO date. Defaults to now. |
| \`subscription_plan_end_date\` | string | ISO date. Defaults to 30 days after registration. |

Do not send \`password\`. The server generates a temporary password and emails it.`;

const hotelFolder = {
  name: '03 Hotel registration',
  description: `Public self-serve onboarding. Creates the hotel, a HOTEL_ADMIN user, a free trial, and returns an access token.

Send multipart/form-data. The logo is a file. A logo URL in the body is ignored.

${envelope}`,
  item: [
    item({
      name: 'Register hotel',
      method: 'POST',
      auth: NO_AUTH,
      events: testScript(saveTokens),
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/hotels/register',
      pathSegments: ['api', 'v1', 'hotels', 'register'],
      body: {
        mode: 'formdata',
        formdata: hotelProvisionFormFields(),
      },
      description: `### POST /api/v1/hotels/register
Public. Same route: \`POST /api/v1/hotel/register\`.

Creates the property as \`ACTIVE\`, creates a \`HOTEL_ADMIN\`, emails a temporary password and a 48-hour setup link, and returns an access token. The frontend does not choose the password. The server generates one.

A duplicate \`owner_email\` returns 409.

Send multipart/form-data. When there is no logo, the same keys can be sent as JSON. Every required and optional key is on the Body form-data rows (all optional fields are enabled).

${hotelProvisionBodyKeysDoc}

Trial, slug, check-in time (\`14:00\`), check-out time (\`12:00\`), timezone \`Asia/Kolkata\`, currency \`INR\`, and tax 18 are set by the server.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`hotel\` | object | Saved hotel. See hotel object below. |
| \`admin.id\` | number | New hotel admin user id. |
| \`admin.name\` | string | Owner name. |
| \`admin.email\` | string | Login email. |
| \`admin.role\` | string | Always \`HOTEL_ADMIN\`. |
| \`admin.is_active\` | boolean | Active flag. |
| \`admin.hotel_id\` | number | New hotel id. |
| \`trial.start_date\` | string | Trial start. |
| \`trial.end_date\` | string | Trial end. |
| \`trial.duration\` | number | Always \`30\`. |
| \`trial.unit\` | string | Always \`days\`. |
| \`auth.token_type\` | string | \`Bearer\`. |
| \`auth.access_token\` | string | Access token for the new admin. Saved into \`{{accessToken}}\`. |
| \`auth.expires_in\` | string | Access token lifetime, usually \`1h\`. |

**Hotel object keys**
| Key | Meaning |
| --- | --- |
| \`id\`, \`name\`, \`slug\` | Id, display name, URL slug. |
| \`owner_id\` | Hotel admin user id. |
| \`address\`, \`city\`, \`state\`, \`country\`, \`pincode\` | Location. |
| \`gst_number\`, \`pan_number\` | Tax ids. Empty string when omitted. |
| \`bank_name\`, \`bank_account_holder\`, \`bank_account_number\`, \`bank_ifsc_code\`, \`bank_branch\` | Bank details printed on the booking bill and folio PDFs. Empty string when not set. |
| \`total_rooms\`, \`hotel_type\`, \`website\`, \`logo\` | Profile. \`logo\` is a full URL. |
| \`is_active\` | \`true\` on registration. A super admin can switch a hotel off. |
| \`subscription_plan_id\` | Current plan id stored on the hotel. |
| \`subscription.plan_id\`, \`subscription.active\`, \`subscription.start_date\`, \`subscription.end_date\`, \`subscription.auto_renew\` | Current purchase window. \`auto_renew\` is false at registration. |
| \`settings.check_in_time\`, \`settings.check_out_time\` | Default \`14:00\` and \`12:00\`. |
| \`settings.timezone\`, \`settings.currency\`, \`settings.tax_percentage\` | \`Asia/Kolkata\`, \`INR\`, \`18\`. |
| \`settings.gst_enabled\` | Whether GST is enabled. On create this is the sent \`gst_enabled\`, or true when a GST number was sent and \`gst_enabled\` was omitted. |
| \`settings.upi_id\` | UPI id, or empty. |
| \`settings.late_checkout_grace_minutes\` | Default 10. |
| \`settings.amenities\` | Default string array. |
| \`settings.policies\` | Default string array. |
| \`owner\` | Present when the owner join is loaded: \`id\`, \`name\`, \`email\`. |
| \`created_at\`, \`updated_at\`, \`deleted_at\` | Timestamps. \`deleted_at\` is null. |`,
    }),
    item({
      name: 'Update my hotel (hotel admin)',
      method: 'PUT',
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/hotels/me',
      pathSegments: ['api', 'v1', 'hotels', 'me'],
      body: {
        mode: 'formdata',
        formdata: [
          // Accepted profile fields. All optional. Send at least one. Empty tax/bank values clear that field.
          textField('name', 'Seaside Residency', 'Optional. Hotel display name. Max 150 characters. Cannot be empty when sent.'),
          textField('address', '12 Marine Drive', 'Optional. Street address. Cannot be empty when sent.'),
          textField('city', 'Mumbai', 'Optional. Max 100 characters. Cannot be empty when sent.'),
          textField('state', 'Maharashtra', 'Optional. Max 100 characters. Cannot be empty when sent.'),
          textField('country', 'India', 'Optional. Max 100 characters.'),
          textField('pincode', '400001', 'Optional. 6-digit Indian PIN code.'),
          textField('gst_number', '27AAAAA0000A1Z5', 'Optional. 15-character GSTIN (e.g. 27AAAAA0000A1Z5). Empty clears it. Does not change gst_enabled. Stored uppercase.'),
          textField('pan_number', 'AAAAA0000A', 'Optional. 10-character PAN (e.g. AAAAA0000A). Empty clears it. Stored uppercase.'),
          textField('bank_name', 'HDFC Bank', 'Optional. Bank name printed on bills and folios. Empty clears it. Max 150 characters.'),
          textField('bank_account_holder', 'Seaside Residency', 'Optional. Account holder name. Empty clears it. Max 150 characters.'),
          textField('bank_account_number', '123456789012', 'Optional. 9 to 18 digits. Empty clears it.'),
          textField('bank_ifsc_code', 'HDFC0001234', 'Optional. 11-character IFSC (e.g. HDFC0001234). Empty clears it. Stored uppercase.'),
          textField('bank_branch', 'Marine Drive, Mumbai', 'Optional. Branch name. Empty clears it. Max 150 characters.'),
          textField('hotel_type', 'Boutique Hotel', 'Optional. Free text, max 100 characters. Example: Boutique Hotel, Resort, Lodge.'),
          textField('website', 'https://seaside.example', 'Optional. Valid URL. A missing http:// is accepted and treated as https.'),
          ...hotelSettingsFormFields(),
          fileField('logo', 'Optional file. Replaces the current logo. Field name logo, logo_image, or file. JPEG, PNG, WebP, GIF, SVG, or AVIF. Max 10 MB.'),

          // Locked for hotel admin. Present so nothing is missing from the collection. Disabled: enable only to see the 400.
          textField('owner_email', 'owner@seaside.example', 'LOCKED. Do not send. Returns 400: owner_email cannot be updated.', true),
          textField('owner_phone', '9876543210', 'LOCKED. Do not send. Returns 400: owner_phone cannot be updated.', true),

          // Super-admin-only fields. Ignored here (not saved). Disabled so a Send does not look like they worked.
          textField('total_rooms', '24', 'Ignored on this route. Only a super admin can change total_rooms (PUT /hotels/:id).', true),
          textField('subscription_plan_id', '{{planId}}', 'Ignored on this route. Only a super admin can change the plan.', true),
          textField('subscription_plan_active', 'true', 'Ignored on this route. Only a super admin can change this.', true),
          textField('subscription_plan_start_date', '2026-10-14', 'Ignored on this route. Only a super admin can change this.', true),
          textField('subscription_plan_end_date', '2027-10-14', 'Ignored on this route. Only a super admin can change this.', true),
          textField('auto_renew', 'false', 'Ignored on this route. Only a super admin can change this.', true),
          textField('is_active', 'true', 'Ignored on this route. Use Update hotel active status (super admin).', true),
          textField('slug', 'seaside-residency', 'Ignored. The slug never changes on update.', true),
        ],
      },
      description: `### PUT /api/v1/hotels/me
${authNote('HOTEL_ADMIN only.')}

Updates the profile of the logged-in hotel admin's own hotel. The hotel is read from the access token. Send only the keys that change. At least one accepted key is required.

Send multipart/form-data. When there is no logo, the same keys can be sent as JSON.

Disabled form-data rows are documented in the Body tab. They are not sent until you enable them. Leave the LOCKED and Ignored rows disabled.

**Accepted body keys** (all optional; send at least one)
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`name\` | string | No | Hotel display name. Max 150. Cannot be empty when sent. |
| \`address\` | string | No | Street address. Cannot be empty when sent. |
| \`city\` | string | No | Max 100. Cannot be empty when sent. |
| \`state\` | string | No | Max 100. Cannot be empty when sent. |
| \`country\` | string | No | Max 100. |
| \`pincode\` | string | No | 6-digit Indian PIN code. |
| \`gst_number\` | string | No | 15-character GSTIN. Empty clears it. Does not change \`gst_enabled\`. Stored uppercase. |
| \`pan_number\` | string | No | 10-character PAN. Empty clears it. Stored uppercase. |
| \`bank_name\` | string | No | Bank name on bills and folios. Empty clears it. Max 150. |
| \`bank_account_holder\` | string | No | Account holder name. Empty clears it. Max 150. |
| \`bank_account_number\` | string | No | 9 to 18 digits. Empty clears it. |
| \`bank_ifsc_code\` | string | No | 11-character IFSC. Empty clears it. Stored uppercase. |
| \`bank_branch\` | string | No | Branch name. Empty clears it. Max 150. |
| \`hotel_type\` | string | No | Free text, max 100. |
| \`website\` | string | No | Valid URL. A missing http:// is treated as https. |
${hotelSettingsBodyKeysDoc}
| \`logo\` | file | No | Replaces the current logo. Field name \`logo\`, \`logo_image\`, or \`file\`. Max 10 MB. |

**Locked keys** (sending any returns 400 and nothing is saved)
| Key | Result |
| --- | --- |
| \`owner_email\`, \`owner_phone\` | 400. Owner contact details cannot be updated. |

**Ignored keys** (accepted by the form but not saved on this route)
| Key | Who changes it |
| --- | --- |
| \`total_rooms\`, \`subscription_plan_id\`, \`subscription_plan_active\`, \`subscription_plan_start_date\`, \`subscription_plan_end_date\`, \`auto_renew\` | Super admin: **Update hotel**. |
| \`is_active\` | Super admin: **Update hotel active status**. |
| \`slug\` | Never. Set at registration. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Updated hotel id. |

${idNote('Use **GET /auth/me** as the hotel admin to read the full hotel and its subscription plan.')}`,
    }),
  ],
};

const planFolder = {
  name: '04 Subscription plans',
  description: `Plan catalog. List and get-one are public. Create, update, and delete are super admin only.

Plan JSON uses camelCase. This is different from rooms, bookings, and users, which use snake_case.

${envelope}`,
  item: [
    item({
      name: 'List plans',
      method: 'GET',
      events: testScript(saveId('plans.0.id', 'planId')),
      auth: NO_AUTH,
      raw: '{{baseUrl}}/api/v1/subscription-plans?page=1&limit=10',
      pathSegments: ['api', 'v1', 'subscription-plans'],
      query: [
        queryParam('billingCycle', 'MONTHLY', 'Optional. MONTHLY or ANNUAL. Case-insensitive. Omit to return both.'),
        queryParam('isActive', 'true', 'Optional. true or false. Omit to return active and inactive plans.'),
        queryParam('isPopular', 'true', 'Optional. true or false.', true),
        queryParam('page', '1', 'Optional. Page number, starting at 1. Default 1.'),
        queryParam('limit', '10', 'Optional. Page size, 1 to 100. Default 10.'),
        queryParam('sortBy', 'display_order', 'Optional. display_order, displayOrder, price, name, created_at, createdAt, updated_at, updatedAt. Default display_order.', true),
        queryParam('sortOrder', 'asc', 'Optional. asc or desc. Default asc.', true),
      ],
      description: `### GET /api/v1/subscription-plans
Public. Soft-deleted plans are omitted.

**Query keys** are on the Params tab. Disabled params are documented and are not sent until you enable them.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`plans\` | array | Plan objects. Keys are listed on Create plan. |
| \`pagination.total\` | number | Matching plans. |
| \`pagination.page\` | number | Current page. |
| \`pagination.limit\` | number | Page size. |
| \`pagination.totalPages\` | number | Page count. |
| \`pagination.hasNextPage\` | boolean | Another page exists. |
| \`pagination.hasPrevPage\` | boolean | A previous page exists. |`,
    }),
    item({
      name: 'Get plan',
      method: 'GET',
      auth: NO_AUTH,
      raw: '{{baseUrl}}/api/v1/subscription-plans/{{planId}}',
      pathSegments: ['api', 'v1', 'subscription-plans', ':id'],
      variable: [idVar('id', '{{planId}}', 'Required. Plan id, positive integer.')],
      description: `### GET /api/v1/subscription-plans/:id
Public.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Plan id. |

**Response \`data\`:** one plan object. Same keys as Create plan, plus \`id\`, \`createdAt\`, \`updatedAt\`, and \`deletedAt\`.`,
    }),
    item({
      name: 'Purchase plan',
      method: 'POST',
      raw: '{{baseUrl}}/api/v1/subscription-plans/{{planId}}/purchase',
      pathSegments: ['api', 'v1', 'subscription-plans', ':id', 'purchase'],
      variable: [idVar('id', '{{planId}}', 'Required. Plan id to buy. Must be an active paid plan. TRIAL is rejected.')],
      body: jsonBody({
        payment_method: 'UPI',
        auto_renew: false,
      }),
      description: `### POST /api/v1/subscription-plans/:id/purchase
${authNote('HOTEL_ADMIN only. A super admin and hotel staff get 403.')}

Buys the plan for the hotel on the access token. Do not send \`hotel_id\`, \`price\`, or dates. The amount is the plan price. The window starts now and ends after one billing cycle (\`MONTHLY\` adds one month, \`ANNUAL\` adds one year).

An inactive or ended plan does not block this call, so a hotel can renew. A deactivated hotel still gets 403. This records the purchase as \`PAID\` and switches the hotel onto the plan. It does not charge a payment provider.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Plan id. Unknown, inactive, free, or \`TRIAL\` plans are rejected. |

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`payment_method\` | string | No | \`CASH\`, \`ONLINE\`, \`CARD\`, \`UPI\`, or \`BANK_TRANSFER\`. Defaults to \`CASH\`. |
| \`auto_renew\` | boolean | No | Stored on the purchase and on the hotel. Defaults to false. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Purchase id. |
| \`hotel_id\` | number | Hotel that bought the plan. |
| \`plan_id\` | number | Plan id. |
| \`purchased_by\` | number | Hotel admin user id. |
| \`amount\` | number | Plan price at purchase time. |
| \`billing_cycle\` | string | \`MONTHLY\` or \`ANNUAL\`. |
| \`payment_method\` | string | Method sent in the body, or \`CASH\` when omitted. |
| \`status\` | string | \`PAID\`. |
| \`auto_renew\` | boolean | Renewal flag. |
| \`starts_at\`, \`ends_at\` | string | Plan window stored on this purchase. |
| \`plan\` | object | \`id\`, \`name\`, \`code\`, \`billingCycle\`, \`price\`, \`maxRooms\`. |

The hotel row stores only \`subscription_plan_id\`. The amount, billing cycle, payment method, \`auto_renew\`, and the start and end dates are stored on this purchase. Access checks and hotel responses read that current purchase.`,
    }),
    item({
      name: 'Create plan',
      method: 'POST',
      events: testScript(saveId('id', 'planId')),
      raw: '{{baseUrl}}/api/v1/subscription-plans',
      pathSegments: ['api', 'v1', 'subscription-plans'],
      body: jsonBody({
        name: 'Growth Monthly',
        billingCycle: 'MONTHLY',
        price: 1999,
        code: 'GROWTH_MONTHLY',
        discountPercent: 0,
        maxRooms: 40,
        description: 'For a mid-size property.',
        badge: 'Popular',
        isPopular: true,
        isActive: true,
        displayOrder: 2,
        features: ['Front desk', 'GST invoices', 'Up to 40 rooms'],
      }),
      description: `### POST /api/v1/subscription-plans
${authNote('SUPER_ADMIN only.')}

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`name\` | string | Yes | Plan name. Max 150 characters. |
| \`billingCycle\` | string | Yes | \`MONTHLY\` or \`ANNUAL\`. Stored uppercase. |
| \`price\` | number | Yes | Price, 0 or more. |
| \`code\` | string | No | Unique-looking code. Letters, numbers, hyphen, underscore. Stored uppercase. Max 100. Server can generate one when omitted. |
| \`discountPercent\` | number | No | 0 to 100. |
| \`maxRooms\` | number | No | Positive integer room cap. |
| \`description\` | string | No | Marketing description. |
| \`badge\` | string | No | Short label. Max 100. Example: Popular. |
| \`isPopular\` | boolean | No | Highlight flag. |
| \`isActive\` | boolean | No | Whether the public list should treat it as active. |
| \`displayOrder\` | number | No | Sort position, 0 or more. |
| \`features\` | string array, or one string | No | Feature lines. A string may be comma-separated or newline-separated. |

${idNote('Use **List plans** to read the new plan.')}`,
    }),
    item({
      name: 'Update plan',
      method: 'PUT',
      raw: '{{baseUrl}}/api/v1/subscription-plans/{{planId}}',
      pathSegments: ['api', 'v1', 'subscription-plans', ':id'],
      variable: [idVar('id', '{{planId}}', 'Required. Plan id to update.')],
      body: jsonBody({
        name: 'Growth Monthly',
        billingCycle: 'MONTHLY',
        price: 2499,
        code: 'GROWTH_MONTHLY',
        discountPercent: 10,
        maxRooms: 50,
        description: 'For a mid-size property.',
        badge: 'Popular',
        isPopular: true,
        isActive: true,
        displayOrder: 2,
        features: ['Front desk', 'GST invoices', 'Up to 50 rooms'],
      }),
      description: `### PUT /api/v1/subscription-plans/:id
${authNote('SUPER_ADMIN only.')}

Send only the keys you want to change. When \`features\` is sent, it replaces the whole feature list.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Plan id. |

**Body keys:** same as Create plan, and every body key is optional on update. An empty \`name\` is rejected.

${idNote('Use **Get plan** to read the updated plan.')}`,
    }),
    item({
      name: 'Archive plan',
      method: 'DELETE',
      raw: '{{baseUrl}}/api/v1/subscription-plans/{{planId}}',
      pathSegments: ['api', 'v1', 'subscription-plans', ':id'],
      variable: [idVar('id', '{{planId}}', 'Required. Plan id to archive.')],
      description: `### DELETE /api/v1/subscription-plans/:id
${authNote('SUPER_ADMIN only.')}

Soft-delete. The plan leaves the public list.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Plan id. |

No body.

${idNote()}`,
    }),
  ],
};

const roomTypeFolder = {
  name: '05 Room categories',
  description: `Room types for one hotel. Names are unique per hotel among categories that are not deleted. Two hotels may use the same name.

Create, update and delete are \`HOTEL_ADMIN\` only. List and get are \`HOTEL_ADMIN\` or \`RECEPTIONIST\`. SUPER_ADMIN is also allowed.

Category names must be unique inside that hotel. Soft-deleted names can be reused.

Send JSON when there are no images. Send multipart when uploading images. Field names for files: \`images\`, \`images[]\`, or \`image\`.

${envelope}`,
  item: [
    item({
      name: 'List room categories',
      method: 'GET',
      events: testScript(saveId('0.id', 'roomTypeId')),
      raw: '{{baseUrl}}/api/v1/room-types',
      pathSegments: ['api', 'v1', 'room-types'],
      description: `### GET /api/v1/room-types
Returns every active category for the logged-in hotel. There is no pagination and no filter query. \`hotel_id\` in the query is ignored.

**Response \`data\`:** an array. Each item:

| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Category id. |
| \`hotel_id\` | number | Hotel that owns it. |
| \`name\` | string | Category name. |
| \`description\` | string | Description, or empty. |
| \`images\` | string array | Full image URLs. |
| \`deleted_at\` | null | Always null in this list. |
| \`created_at\`, \`updated_at\` | string | Timestamps. |`,
    }),
    item({
      name: 'Get room category',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/room-types/{{roomTypeId}}',
      pathSegments: ['api', 'v1', 'room-types', ':id'],
      variable: [idVar('id', '{{roomTypeId}}', 'Required. Room category id.')],
      description: `### GET /api/v1/room-types/:id
A category from another hotel returns 403. Missing id returns 404.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Category id. |

**Response \`data\`:** one category. Same keys as the list item.`,
    }),
    item({
      name: 'Create room category',
      method: 'POST',
      events: testScript(saveId('id', 'roomTypeId')),
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/room-types',
      pathSegments: ['api', 'v1', 'room-types'],
      body: {
        mode: 'formdata',
        formdata: [
          textField('name', 'Deluxe', 'Required. Category name. Max 150 characters. Unique among active categories in this hotel. Comparison ignores case.'),
          textField('description', 'King bed, city view, free Wi-Fi.', 'Optional. Plain text description.'),
          fileField('images', 'Optional. Repeat this field for more files, or use images[] / image. Any number of images, 10 MB each.'),
        ],
      },
      description: `### POST /api/v1/room-types
${authNote('HOTEL_ADMIN only.')}

Do not send \`hotel_id\`. The server uses the hotel on the token.

**Body keys** are described on each form row.

A duplicate active name in the same hotel returns 409.

${idNote('Use **List room categories** to read the new category.')}`,
    }),
    item({
      name: 'Update room category',
      method: 'PUT',
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/room-types/{{roomTypeId}}',
      pathSegments: ['api', 'v1', 'room-types', ':id'],
      variable: [idVar('id', '{{roomTypeId}}', 'Required. Category id to update.')],
      body: {
        mode: 'formdata',
        formdata: [
          textField('name', 'Deluxe Sea View', 'Optional. New name. Cannot be empty. Still unique per hotel, excluding this category.'),
          textField('description', 'King bed and a sea view.', 'Optional. Replaces the description.'),
          fileField('images', 'Optional. New images are added. Existing images stay unless your screen removes them through a later API. This request only uploads new files.'),
        ],
      },
      description: `### PUT /api/v1/room-types/:id
${authNote('HOTEL_ADMIN only.')}

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Category id. |

**Body keys** are on the form rows. Send only what changes.

Another hotel's category returns 403.

${idNote('Use **Get room category** to read the updated category.')}`,
    }),
    item({
      name: 'Delete room category',
      method: 'DELETE',
      raw: '{{baseUrl}}/api/v1/room-types/{{roomTypeId}}',
      pathSegments: ['api', 'v1', 'room-types', ':id'],
      variable: [idVar('id', '{{roomTypeId}}', 'Required. Category id to delete.')],
      description: `### DELETE /api/v1/room-types/:id
${authNote('HOTEL_ADMIN only.')}

Soft-delete. Fails when any physical room still uses this category. Move or delete those rooms first.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Category id. |

No body.

${idNote()}`,
    }),
  ],
};

const roomFolder = {
  name: '06 Physical rooms',
  description: `Create, update and delete are \`HOTEL_ADMIN\` only. List, get and status change are \`HOTEL_ADMIN\` or \`RECEPTIONIST\`. SUPER_ADMIN is also allowed.

Room number is unique per hotel and floor. Room 101 on floor 1 and room 101 on floor 2 are both allowed. The same number on the same floor is not.

Room status values: \`AVAILABLE\`, \`RESERVED\`, \`OCCUPIED\`, \`CLEANING\`, \`MAINTENANCE\`, \`BLOCKED\`. Send any case. The server stores uppercase.

Use JSON when you are not uploading images. Use multipart when you are. File field names: \`images\`, \`images[]\`, or \`image\`.

On create, a multipart string \`"false"\` for \`is_active\` is treated as true because the server uses JavaScript Boolean(). Send room create and update as JSON when you need \`is_active: false\` and you have no new image.

## Live room status
Connect a Socket.IO client to \`{{baseUrl}}\`. Send the access token. The server joins you to your hotel only.

\`\`\`js
io(baseUrl, { auth: { token: accessToken }, withCredentials: true })
\`\`\`

Any logged-in hotel role can connect: hotel admin, receptionist, manager, housekeeping, and accountant. Each user is joined only to their own hotel. A super admin has no hotel on the token, so also send \`auth.hotel_id\`. A disabled or inactive account is rejected.

Listen for \`room:status\`. The payload is \`id\`, \`hotel_id\`, \`room_number\`, \`floor\`, \`status\`, \`is_active\`, \`deleted_at\`, \`updated_at\`. It is sent when a room is created, when its status or active flag changes, and when a booking moves the room (occupied, reserved, cleaning, available).

Every \`room:status\` is followed by \`room:status_breakdown\` for the same hotel. Use that for live dashboard cards. Payload:

\`\`\`json
{
  "hotel_id": 3,
  "room_status_breakdown": {
    "AVAILABLE": 4,
    "OCCUPIED": 22,
    "RESERVED": 0,
    "CLEANING": 2,
    "MAINTENANCE": 0,
    "BLOCKED": 0
  }
}
\`\`\`

${envelope}`,
  item: [
    item({
      name: 'Create room',
      method: 'POST',
      events: testScript(saveId('id', 'roomId')),
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/rooms',
      pathSegments: ['api', 'v1', 'rooms'],
      body: {
        mode: 'formdata',
        formdata: [
          textField('room_number', '101', 'Required. Room number or label. Max 50 characters. Unique with floor inside this hotel.'),
          textField('room_type_id', '{{roomTypeId}}', 'Required. Category id from Room categories. Must belong to this hotel.'),
          textField('floor', '1', 'Optional. Integer floor. Default 1. Negative floors are allowed, for example -1 for basement.'),
          textField('status', 'AVAILABLE', 'Optional. AVAILABLE, RESERVED, OCCUPIED, CLEANING, MAINTENANCE, or BLOCKED. Default AVAILABLE.'),
          textField('seating_capacity', '2', 'Optional. Positive integer. Default 2. Guest capacity, not bed count.'),
          textField('bed_count', '1', 'Optional. Positive integer. Default 1.'),
          textField('bed_type', '1 King Bed', 'Optional. Free text, max 100 characters. Default "1 King Bed".'),
          textField('custom_price_per_night', '3500', 'Optional. Number, 0 or more. Nightly rate for this room. Empty means no custom price.'),
          textField('notes', 'Corner room', 'Optional. Internal note.'),
          textField('amenities', '["Wi-Fi","AC","TV"]', 'Optional. JSON array, or a comma-separated string such as Wi-Fi, AC, TV.'),
          textField('cleaning_started_at', '', 'Optional. ISO datetime when housekeeping started. Leave empty unless status is CLEANING.', true),
          textField('cleaning_duration_minutes', '15', 'Optional. Positive integer. Default 15. How long cleaning is expected to take.'),
          textField('is_active', 'true', 'Optional. true or false. Default true. Inactive rooms can be hidden by the list filter. Prefer JSON for false. See the folder note.'),
          fileField('images', 'Optional room photos. Repeat the field for more files.'),
        ],
      },
      description: `### POST /api/v1/rooms
${authNote('HOTEL_ADMIN only.')}

Do not send \`hotel_id\`. The category must already exist in this hotel.

A duplicate \`room_number\` on the same floor returns 409.

The hotel's subscription plan must allow one more room. A request is rejected with 403 when the hotel already has as many rooms as the plan's \`max_rooms\`. Deleted rooms are not counted. Updating or deleting rooms is not affected. A hotel whose plan is not active or has ended cannot call this API at all: every protected request returns 403 with \`code: "PLAN_INACTIVE"\` or \`"PLAN_EXPIRED"\` (the user is not logged out) until a super admin renews the plan.

**Body keys** are described on each form row.

${idNote('Use **List rooms** to read the new room.')}`,
    }),
    item({
      name: 'List rooms',
      method: 'GET',
      events: testScript(saveId('rooms.0.id', 'roomId')),
      raw: '{{baseUrl}}/api/v1/rooms?page=1&limit=10&sort_by=floor&sort_order=asc',
      pathSegments: ['api', 'v1', 'rooms'],
      query: [
        queryParam('page', '1', 'Optional. Page number, starting at 1. Default 1.'),
        queryParam('limit', '10', 'Optional. Page size, 1 to 100. Default 10.'),
        queryParam('sort_by', 'floor', 'Optional. Sort field. Only floor. Default floor.'),
        queryParam('sort_order', 'asc', 'Optional. asc lists the lowest floor first. desc lists the highest floor first. Rooms on the same floor follow the same direction. Default asc.'),
        queryParam('floor', '1', 'Optional. Exact floor number.', true),
        queryParam('room_type_id', '{{roomTypeId}}', 'Optional. Only rooms in this category.', true),
        queryParam('status', 'AVAILABLE', 'Optional. AVAILABLE, RESERVED, OCCUPIED, CLEANING, MAINTENANCE, or BLOCKED.', true),
        queryParam('is_active', 'true', 'Optional. true or false.', true),
        queryParam('search', '101', 'Optional. Matches room number. Same search as room_number.', true),
        queryParam('room_number', '101', 'Optional. Alias of search. Matches room number.', true),
      ],
      description: `### GET /api/v1/rooms
Rooms for the logged-in hotel only. Soft-deleted rooms are omitted.

Default order is floor ascending, then room number ascending. Send \`sort_order=desc\` to reverse that. \`sort_by\` only accepts \`floor\`.

**Query keys** are on the Params tab.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`rooms\` | array | Room objects. Keys are listed on Get room. |
| \`hotel\` | object or null | GST / tax details for the logged-in hotel (same on every page). |
| \`hotel.id\` | number | Hotel id. |
| \`hotel.name\` | string | Hotel name. |
| \`hotel.gst_number\` | string | GSTIN. Empty when not set. |
| \`hotel.pan_number\` | string | PAN. Empty when not set. |
| \`hotel.gst_enabled\` | boolean | Whether GST is enabled for the hotel. |
| \`hotel.tax_percentage\` | number | Default tax / GST percentage (e.g. \`18\`). |
| \`hotel.currency\` | string | Hotel currency (e.g. \`INR\`). |
| \`total\` | number | Matching rooms. |
| \`page\` | number | Current page. |
| \`limit\` | number | Page size. |
| \`totalPages\` | number | Page count. Camel case, not \`total_pages\`. |`,
    }),
    item({
      name: 'Get room',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/rooms/{{roomId}}',
      pathSegments: ['api', 'v1', 'rooms', ':id'],
      variable: [idVar('id', '{{roomId}}', 'Required. Physical room id.')],
      description: `### GET /api/v1/rooms/:id
Another hotel's room returns 403.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Room id. |

**Response \`data\`:** one room object.

| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Room id. |
| \`hotel_id\` | number | Hotel from the token. |
| \`hotel_name\` | string or null | Hotel name when joined. |
| \`room_number\` | string | Room number. |
| \`room_type_id\` | number | Category id. |
| \`room_type_name\` | string or null | Category name. |
| \`floor\` | number | Floor. |
| \`status\` | string | One of the six room statuses. |
| \`seating_capacity\` | number | Guest capacity. |
| \`bed_count\` | number | Beds. |
| \`bed_type\` | string | Bed description. |
| \`custom_price_per_night\` | number or null | Custom nightly rate. |
| \`notes\` | string | Internal note. |
| \`amenities\` | string array | Parsed amenity list. |
| \`cleaning_started_at\` | string or null | Cleaning start. |
| \`cleaning_duration_minutes\` | number | Expected cleaning minutes. |
| \`is_active\` | boolean | Whether the room is active. |
| \`images\` | string array | Full image URLs. |
| \`deleted_at\` | null | Null until deleted. |
| \`created_at\`, \`updated_at\` | string | Timestamps. |`,
    }),
    item({
      name: 'Update room',
      method: 'PUT',
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/rooms/{{roomId}}',
      pathSegments: ['api', 'v1', 'rooms', ':id'],
      variable: [idVar('id', '{{roomId}}', 'Required. Room id to update.')],
      body: {
        mode: 'formdata',
        formdata: [
          textField('room_number', '101', 'Optional. New room number. Still unique per hotel and floor.', true),
          textField('room_type_id', '{{roomTypeId}}', 'Optional. Move the room to another category in this hotel.', true),
          textField('floor', '1', 'Optional. New floor. Uniqueness is checked with the room number.', true),
          textField('status', 'MAINTENANCE', 'Optional. One of the six room statuses. Prefer Update room status when only the status changes.', true),
          textField('seating_capacity', '3', 'Optional. Positive integer.', true),
          textField('bed_count', '2', 'Optional. Positive integer.', true),
          textField('bed_type', '2 Twin Beds', 'Optional. Max 100 characters.', true),
          textField('custom_price_per_night', '4000', 'Optional. 0 or more. Send an empty value to clear the custom price.', true),
          textField('notes', 'Under maintenance until Friday', 'Optional. Replaces the note.', true),
          textField('amenities', '["Wi-Fi","AC"]', 'Optional. Replaces the amenity list. JSON array or comma-separated text.', true),
          textField('cleaning_started_at', '', 'Optional. ISO datetime, or empty to clear.', true),
          textField('cleaning_duration_minutes', '20', 'Optional. Positive integer.', true),
          textField('is_active', 'true', 'Optional. true, false, 1, or 0.', true),
          fileField('images', 'Optional. New photos are uploaded and added.'),
        ],
      },
      description: `### PUT /api/v1/rooms/:id
${authNote('HOTEL_ADMIN only.')}

Send only the keys that change. Disabled form rows are not sent until you enable them.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Room id. |

${idNote('Use **Get room** to read the updated room.')}`,
    }),
    item({
      name: 'Update room status',
      method: 'PATCH',
      raw: '{{baseUrl}}/api/v1/rooms/{{roomId}}/status',
      pathSegments: ['api', 'v1', 'rooms', ':id', 'status'],
      variable: [idVar('id', '{{roomId}}', 'Required. Room id.')],
      body: jsonBody({
        status: 'CLEANING',
      }),
      description: `### PATCH /api/v1/rooms/:id/status
${authNote('HOTEL_ADMIN or RECEPTIONIST.')}

Changes only \`status\`. Price, number, floor, and other fields stay as they are.

Setting \`CLEANING\` starts the cleaning timer. When the room's \`cleaning_duration_minutes\` have passed, the server sets it to \`AVAILABLE\`. Checkout uses 20 minutes.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Room id. |

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`status\` | string | Yes | \`AVAILABLE\`, \`RESERVED\`, \`OCCUPIED\`, \`CLEANING\`, \`MAINTENANCE\`, or \`BLOCKED\`. |

Unknown status returns 400.

${idNote('Use **Get room** to read the room with the new status.')}`,
    }),
    item({
      name: 'Delete room',
      method: 'DELETE',
      raw: '{{baseUrl}}/api/v1/rooms/{{roomId}}',
      pathSegments: ['api', 'v1', 'rooms', ':id'],
      variable: [idVar('id', '{{roomId}}', 'Required. Room id to soft-delete.')],
      description: `### DELETE /api/v1/rooms/:id
${authNote('HOTEL_ADMIN only.')}

Soft-delete. Only a room with status \`AVAILABLE\` can be deleted. A room that is \`OCCUPIED\`, \`RESERVED\`, \`CLEANING\`, or \`MAINTENANCE\` returns 400. Change its status first, or wait until it is free.

The room leaves the list and its room number can be used again on that floor. Past bookings keep the room: \`rooms\` on those bookings still shows its \`room_number\`, \`floor\`, and \`room_type_name\`.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Room id. |

No body.

${idNote()}`,
    }),
  ],
};

const bookingFolder = {
  name: '07 Bookings',
  description: `${authNote('HOTEL_ADMIN or RECEPTIONIST. SUPER_ADMIN is also allowed.')}

Two different statuses:
| Key | Values | Meaning |
| --- | --- | --- |
| \`booking_status\` | \`PENDING\`, \`CONFIRMED\`, \`CHECKED_IN\`, \`CHECKED_OUT\`, \`CANCELLED\`, \`NO_SHOW\` | The stay |
| \`payment_status\` | \`PENDING\`, \`PARTIALLY_PAID\`, \`PAID\` | The bill. Calculated from amounts. Do not send it. |

Create stores \`CHECKED_IN\` when \`booking_status\` is omitted. \`created_by\` is the logged-in user. \`actual_check_in\` is the current time. The room is marked \`OCCUPIED\`.

What each stay status does to the room:
| booking_status | Room |
| --- | --- |
| \`CHECKED_IN\` | Every room becomes \`OCCUPIED\`. Sets \`actual_check_in\` if it was empty. |
| \`CHECKED_OUT\` | Allowed only when \`due_amount\` is 0, otherwise 400. Every room becomes \`CLEANING\` for 20 minutes, then \`AVAILABLE\` automatically. Sets \`actual_check_out\` if it was empty. |
| \`CONFIRMED\` | \`RESERVED\` only when the room is \`AVAILABLE\` and nobody else is checked in. |
| \`PENDING\` | Room stays as it is on create. |
| \`CANCELLED\`, \`NO_SHOW\` | Releases the room when this stay was holding it. Another checked-in stay keeps it \`OCCUPIED\`. Another confirmed stay keeps it \`RESERVED\`. Otherwise \`AVAILABLE\`. \`MAINTENANCE\`, \`BLOCKED\`, and \`CLEANING\` are not cleared. |

\`CHECKED_OUT\`, \`CANCELLED\`, and \`NO_SHOW\` no longer block the dates, so the room can be booked again.

Create and update each require at least one guest photo in \`images\` and one signature. Send them as form-data files. A URL is ignored. A file field whose name contains \`sign\` or \`signature\` is the signature. Any other image file is a guest photo.

${envelope}`,
  item: [
    item({
      name: 'Create booking',
      method: 'POST',
      events: testScript(saveId('id', 'bookingId')),
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/bookings',
      pathSegments: ['api', 'v1', 'bookings'],
      body: {
        mode: 'formdata',
        formdata: [
          textField('primary_guest_name', 'Ravi Shah', 'Required. Guest on the booking. 2 to 255 characters.'),
          textField('secondary_guest_name', 'Meera Shah', 'Optional. Second guest name. Max 255 characters.', true),
          textField('mobile_number', '9876543210', 'Required. 7 to 20 characters. Digits, spaces, plus, and hyphen.'),
          textField('email', 'guest@example.com', 'Optional. Guest email. Not unique: any address is accepted, even a staff or admin login email.', true),
          textField('address', '12 Lake Road, Pune', 'Optional. Guest address.', true),
          textField('room_id', '[{{roomId}}]', 'Required. Array of room ids in this hotel. Send JSON: [12, 15]. Every room is held for the same dates and receives the same stay status at the same time. One room is still an array: [12].'),
          textField('check_in_date', '2026-10-14T14:00:00.000Z', 'Required. Scheduled check-in. ISO date or datetime. Must be before check_out_date.'),
          textField('check_out_date', '2026-10-16T12:00:00.000Z', 'Required. Scheduled check-out. ISO date or datetime. Nights are calculated from these two dates.'),
          textField('actual_check_out', '', 'Optional. Real check-out time. Leave empty on create unless the stay is already finished.', true),
          textField('adults', '2', 'Optional. Integer, minimum 1. Default 1.'),
          textField('children', '0', 'Optional. Integer, 0 or more. Default 0.'),
          textField('base_amount', '7000', 'Optional. Room charge before tax and extras. 0 or more. When omitted, the server adds each room custom price and multiplies by nights.'),
          textField('discount_amount', '0', 'Optional. Discount. 0 or more. Default 0.'),
          textField('gst_rate', '18', 'Optional. GST percent, 0 to 100. Default 18. Split into equal CGST and SGST.'),
          textField('paid_amount', '2000', 'Optional. Amount already collected. 0 or more. Default 0. This sets payment_status.'),
          textField('payment_method', 'CASH', 'Optional. How paid_amount was paid: CASH, ONLINE, CARD, UPI, or BANK_TRANSFER. Default CASH. Saved in the payment history.', true),
          textField('notes', 'Late arrival after 10 pm', 'Optional. Front desk note.'),
          textField('booking_status', 'CHECKED_IN', 'Optional. PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, or NO_SHOW. When omitted, the server stores CHECKED_IN.'),
          fileField('images', 'Required. At least one guest photo. Repeat this field to add more photos.'),
          fileField('signatures', 'Required. At least one signature image.'),
        ],
      },
      description: `### POST /api/v1/bookings
${authNote('HOTEL_ADMIN or RECEPTIONIST.')}

Do not send \`hotel_id\`, \`created_by\`, \`actual_check_in\`, \`booking_number\`, \`number_of_nights\`, \`payment_status\`, tax amounts, \`total_amount\`, \`due_amount\`, \`extra_charges_total\`, \`late_checkout_charge\`, or \`late_checkout_hours\`. The extra charges and late checkout fields are only set by **Check out**. \`created_by\` is the user id from the access token. \`actual_check_in\` is the server time when the booking is created. The server calculates the amounts.

The room must be free for the scheduled dates. A stay still blocks those dates while \`booking_status\` is \`PENDING\`, \`CONFIRMED\`, or \`CHECKED_IN\` and \`actual_check_out\` is empty. Overlap returns 400.

**Body keys** are described on each form row.

${idNote('Use **List bookings** to find the new booking and **Get booking** to read it.')}`,
    }),
    item({
      name: 'List bookings',
      method: 'GET',
      events: testScript(saveId('bookings.0.id', 'bookingId')),
      raw: '{{baseUrl}}/api/v1/bookings?page=1&limit=10',
      pathSegments: ['api', 'v1', 'bookings'],
      query: [
        queryParam('page', '1', 'Optional. Page number, starting at 1. Default 1.'),
        queryParam('limit', '10', 'Optional. Page size, 1 to 100. Default 10.'),
        queryParam('booking_status', 'CHECKED_IN', 'Optional stay filter. PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, or NO_SHOW. Case-insensitive.', true),
        queryParam('payment_status', 'PENDING', 'Optional bill filter. PENDING, PARTIALLY_PAID, or PAID. This is not the stay status.', true),
        queryParam('room_id', '{{roomId}}', 'Optional. One room id. Returns bookings whose room_id array contains this room.', true),
        queryParam('booking_number', 'BK-', 'Optional. Partial match on the booking number.', true),
        queryParam('primary_guest_name', 'Ravi', 'Optional. Partial match on the primary guest name.', true),
        queryParam('guest_name', 'Shah', 'Optional. Partial match on primary or secondary guest name.', true),
        queryParam('mobile_number', '98765', 'Optional. Partial match on mobile.', true),
        queryParam('search', 'Ravi', 'Optional. Matches guest name, mobile, or booking number.', true),
        queryParam('check_in_from', '2026-10-01', 'Optional. Scheduled check-in on or after this ISO date.', true),
        queryParam('check_in_to', '2026-10-31', 'Optional. Scheduled check-in on or before this ISO date.', true),
        queryParam('check_out_from', '2026-10-01', 'Optional. Scheduled check-out on or after this ISO date.', true),
        queryParam('check_out_to', '2026-10-31', 'Optional. Scheduled check-out on or before this ISO date.', true),
      ],
      description: `### GET /api/v1/bookings
Bookings for the logged-in hotel. Soft-deleted rows are omitted. Newest first.

\`booking_status\` filters the stay. \`payment_status\` filters the bill. They can be used together.

**Query keys** are on the Params tab. Only page and limit are sent until you enable the others.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`bookings\` | array | Short booking objects. Use **Get booking** for the full details. |
| \`total\` | number | Matching bookings. |
| \`page\` | number | Current page. |
| \`limit\` | number | Page size. |
| \`totalPages\` | number | Page count. |

**Each item in \`bookings\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Booking id. |
| \`hotel_id\` | number | Hotel id. |
| \`booking_number\` | string | Booking number. |
| \`primary_guest_name\` | string | Main guest. |
| \`mobile_number\` | string | Guest mobile. |
| \`booking_status\` | string | Stay status: PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, or NO_SHOW. |
| \`rooms\` | object array | One object per room: \`id\`, \`room_number\`, \`floor\`, \`room_type_name\`. |`,
    }),
    item({
      name: 'Get booking',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}',
      pathSegments: ['api', 'v1', 'bookings', ':id'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id.')],
      description: `### GET /api/v1/bookings/:id
Another hotel's booking returns 403.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

**Response \`data\`:** one booking, plus \`payment_history\`.

| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Booking id. |
| \`hotel_id\` | number | Hotel from the token. |
| \`booking_number\` | string | Generated, format \`BK-YYYYMMDD-XXXXXX\`. |
| \`primary_guest_name\` | string | Main guest. |
| \`secondary_guest_name\` | string or null | Second guest. |
| \`mobile_number\` | string | Guest mobile. |
| \`email\` | string or null | Guest email. Not unique and not a login email. Null when omitted. |
| \`address\` | string | Guest address. |
| \`room_id\` | number array | Every room on this stay. Example: \`[12, 15]\`. |
| \`rooms\` | object array | One object per room: \`id\`, \`room_number\`, \`floor\`, \`room_type_name\`. |
| \`created_by\` | number | User id from the access token. |
| \`check_in_date\`, \`check_out_date\` | string | Scheduled stay. Not changed by checkout. |
| \`actual_check_in\` | string | Server time when the booking was created. |
| \`actual_check_out\` | string or null | Real check-out time. Null until checkout. |
| \`number_of_nights\` | number | Calculated from the scheduled dates. Minimum handling is server-side. |
| \`adults\`, \`children\` | number | Guest counts. |
| \`base_amount\` | number | Room charge before tax. |
| \`discount_amount\` | number | Discount. |
| \`extra_charges_total\` | number | Extras. Added to the total with no GST. |
| \`late_checkout_charge\`, \`late_checkout_hours\` | number | Late checkout. The charge is added to the total with no GST. |
| \`gst_rate\` | number | GST percent. |
| \`cgst_rate\`, \`sgst_rate\` | number | Each is half of \`gst_rate\`. |
| \`taxable_amount\` | number | Amount GST is applied to: room charge minus discount. Extra charges and the late checkout charge are not included. |
| \`gst_amount\`, \`cgst_amount\`, \`sgst_amount\` | number | Tax amounts. |
| \`tax_amount\` | number | Tax total. |
| \`total_amount\` | number | Amount due before payments. |
| \`paid_amount\` | number | Collected so far. |
| \`due_amount\` | number | \`total_amount - paid_amount\`. |
| \`payment_status\` | string | \`PENDING\`, \`PARTIALLY_PAID\`, or \`PAID\`. |
| \`booking_status\` | string | Stay status. |
| \`images\`, \`signatures\` | string arrays | URLs of the uploaded files. |
| \`notes\` | string | Front desk note. |
| \`hotel\` | object | \`id\`, \`name\`, \`slug\` when joined. |
| \`creator\` | object | \`id\`, \`name\`, \`email\`, \`role\` of the staff user. |
| \`deleted_at\` | null | Null until deleted. |
| \`created_at\`, \`updated_at\` | string | Timestamps. |

**\`payment_history\`** lists every change to the amount paid, newest first. A row is added when the booking is created with a paid amount, when **Update booking** changes \`paid_amount\`, and when **Check out** collects \`paid_amount\`.

| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Payment row id. |
| \`booking_id\` | number | Booking id. |
| \`amount\` | number | Money received. Negative when \`paid_amount\` was lowered on an update. |
| \`payment_method\` | string | \`CASH\`, \`ONLINE\`, \`CARD\`, \`UPI\`, or \`BANK_TRANSFER\`. |
| \`status\` | string | Status of this payment: \`PAID\` (the bill is fully paid after it), \`PARTIALLY_PAID\` (a balance is left), \`REFUNDED\` (money taken back), or \`FAILED\` (did not go through). The server sets \`PAID\`, \`PARTIALLY_PAID\` and \`REFUNDED\` itself. |
| \`source\` | string | \`BOOKING\` (create), \`UPDATE\` (booking edit), or \`CHECKOUT\`. |
| \`received_by\` | object or null | \`id\` and \`name\` of the staff user. |
| \`received_at\` | string | When it was recorded. |`,
    }),
    item({
      name: 'Generate booking PDF',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}/pdf',
      pathSegments: ['api', 'v1', 'bookings', ':id', 'pdf'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id.')],
      description: `### GET /api/v1/bookings/:id/pdf
${authNote('HOTEL_ADMIN or RECEPTIONIST.')}

Builds the folio from this booking, including the hotel's bank details (only when the hotel has added them), the guest signature and every uploaded image under ID proofs. The file is saved under uploads/pdfs and removed every 3 hours.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`url\` | string | Open this address in a browser to view the PDF. |
| \`file_name\` | string | File name in the uploads folder. |`,
    }),
    item({
      name: 'Generate booking bill',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}/bill',
      pathSegments: ['api', 'v1', 'bookings', ':id', 'bill'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id.')],
      description: `### GET /api/v1/bookings/:id/bill
${authNote('HOTEL_ADMIN or RECEPTIONIST.')}

Builds a professional guest **tax invoice / bill slip** for this booking only (hotel letterhead, guest and stay details). The table has one row per room: Sr No, Room, Room Category, Floor, Nights, Room Price (per night) and Amount (price x nights). Under it: Total, Discount, Taxable Amount, CGST, SGST, Extra Charges, Late Checkout Charges, Grand Total, Amount Paid and Balance Due, then Payment Received (net amount paid per method, total paid, balance due), the hotel's bank details (only when the hotel has added them), the bill amount in words and an empty Authorised Signatory space to sign by hand (no signature image is printed). It does not include the full folio extras such as ID proofs or the payment ledger. The file is saved under uploads/pdfs and removed every 3 hours.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`url\` | string | Open this address in a browser to view the bill PDF. |
| \`file_name\` | string | File name in the uploads folder. |`,
    }),
    item({
      name: 'Update booking',
      method: 'PUT',
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}',
      pathSegments: ['api', 'v1', 'bookings', ':id'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id to update.')],
      body: {
        mode: 'formdata',
        formdata: [
          textField('primary_guest_name', 'Ravi Shah', 'Optional. 2 to 255 characters.', true),
          textField('secondary_guest_name', 'Meera Shah', 'Optional. Send empty to clear.', true),
          textField('mobile_number', '9876543210', 'Optional. 7 to 20 characters.', true),
          textField('email', 'guest@example.com', 'Optional. Guest email. Not unique: any address is accepted, even a staff or admin login email. Send empty to clear.', true),
          textField('address', '12 Lake Road, Pune', 'Optional. Send empty to clear.', true),
          textField('room_id', '[{{roomId}}]', 'Optional. Replace the whole room list. JSON array, for example [12, 15]. Rooms removed from the list are released. Rooms added get the current booking status.', true),
          textField('check_in_date', '2026-10-14T14:00:00.000Z', 'Optional. New scheduled check-in. Nights are recalculated.', true),
          textField('check_out_date', '2026-10-16T12:00:00.000Z', 'Optional. New scheduled check-out.', true),
          textField('actual_check_in', '', 'Optional. ISO datetime, or empty to clear.', true),
          textField('actual_check_out', '', 'Optional. ISO datetime, or empty to clear. Checkout API is the normal way to set this.', true),
          textField('adults', '2', 'Optional. Integer, minimum 1.', true),
          textField('children', '1', 'Optional. Integer, 0 or more.', true),
          textField('base_amount', '7000', 'Optional. Recalculates tax, total, due, and payment_status.', true),
          textField('discount_amount', '500', 'Optional. Recalculates pricing.', true),
          textField('gst_rate', '18', 'Optional. 0 to 100.', true),
          textField('paid_amount', '2000', 'Optional. On this update API, this replaces the stored paid amount. On checkout, paid_amount is added instead.', true),
          textField('payment_method', 'CASH', 'Optional. How the change in paid_amount was paid: CASH, ONLINE, CARD, UPI, or BANK_TRANSFER. Default CASH. Saved in the payment history.', true),
          textField('notes', 'Guest requested an extra bed', 'Optional. Replaces the note.', true),
          fileField('images', 'Required. At least one guest photo. Replaces the stored photos.'),
          fileField('signatures', 'Required. At least one signature image. Replaces the stored signature.'),
        ],
      },
      description: `### PUT /api/v1/bookings/:id
${authNote('HOTEL_ADMIN or RECEPTIONIST.')}

This does not change \`booking_status\`. Use **Update booking status** or **Check out** for the stay.

Send at least one guest photo file and one signature file on every update. A URL does not count. Missing either file returns 400.

\`extra_charges_total\`, \`late_checkout_charge\`, and \`late_checkout_hours\` are not accepted here. They are only set by **Check out**, and an update keeps the stored values.

On this API, \`paid_amount\` replaces the stored paid amount. On checkout, \`paid_amount\` is added to what was already paid. Every change to the paid amount is added to the payment history.

Changing room or dates checks overlap again, ignoring this booking.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

**Body keys** are on the form rows. Disabled rows are not sent.

${idNote('Use **Get booking** to read the updated booking.')}`,
    }),
    item({
      name: 'Check out',
      method: 'POST',
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}/check-out',
      pathSegments: ['api', 'v1', 'bookings', ':id', 'check-out'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id to check out.')],
      body: jsonBody({
        paid_amount: 1500,
        payment_method: 'UPI',
        extra_charges_total: 300,
        late_checkout_charge: 500,
        late_checkout_hours: 2,
        notes: 'Collected remaining balance at the desk',
      }),
      description: `### POST /api/v1/bookings/:id/check-out
Sets \`booking_status\` to \`CHECKED_OUT\`, sets \`actual_check_out\`, and marks every room in \`room_id\` as \`CLEANING\`. After 20 minutes each room becomes \`AVAILABLE\` again on its own. You can still change the room status at any time with **Update room status**.

The payment must equal the due amount exactly. Paying less or more returns 400 and nothing is saved. The due amount includes the extra charges and the late fee. GST is not added on either of them. The 400 message shows the exact due amount to send. When nothing is due, send \`{}\` or \`paid_amount: 0\`. Any amount collected here is added to the payment history.

Scheduled \`check_in_date\`, \`check_out_date\`, and \`number_of_nights\` stay as booked.

A second checkout, when \`actual_check_out\` is already set, returns 400.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

**Body keys** — all optional. Send \`{}\` for a checkout with no extra payment.
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`paid_amount\` | number | No | Collected now. Added to the existing \`paid_amount\`. It does not replace it. Must equal the current due amount exactly, or 0 when nothing is due. |
| \`payment_method\` | string | No | \`CASH\`, \`ONLINE\`, \`CARD\`, \`UPI\`, or \`BANK_TRANSFER\`. Default \`CASH\`. Saved with the payment. |
| \`extra_charges_total\` | number | No | Extra charges for the whole stay (minibar, laundry, and so on). No GST is added on it. This is the full total, not only the new amount: it replaces the stored \`extra_charges_total\`. Leave it out to keep the stored value. Updates total and due. 0 or more. |
| \`late_checkout_charge\` | number | No | Late fee. Added to the total with no GST, and updates due. 0 or more. |
| \`late_checkout_hours\` | number | No | Hours late. 0 or more. |
| \`notes\` | string | No | Appended to the existing note. It does not wipe the old note. |

${idNote('Use **Get booking** to read the booking after checkout.')}

\`\`\`json
{ "success": true, "message": "Checkout completed successfully. Room is now marked for cleaning." }
\`\`\``,
    }),
    item({
      name: 'Update booking status',
      method: 'PATCH',
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}/status',
      pathSegments: ['api', 'v1', 'bookings', ':id', 'status'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id.')],
      body: jsonBody({
        booking_status: 'CONFIRMED',
      }),
      description: `### PATCH /api/v1/bookings/:id/status
Changes only the stay status, then updates every room in \`room_id\` as described in the folder notes.

Guest, dates, and payment are not changed by this API. \`CHECKED_IN\` fills \`actual_check_in\` when it is empty. \`CHECKED_OUT\` fills \`actual_check_out\` when it is empty.

\`CHECKED_OUT\` returns 400 while \`due_amount\` is above 0. Pay the balance first with **Update booking** or use **Check out** with \`paid_amount\`. After checkout the rooms are \`CLEANING\` for 20 minutes and then \`AVAILABLE\`.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`booking_status\` | string | Yes | \`PENDING\`, \`CONFIRMED\`, \`CHECKED_IN\`, \`CHECKED_OUT\`, \`CANCELLED\`, or \`NO_SHOW\`. |

${idNote('Use **Get booking** to read the booking and **Get room** to read the room status.')}`,
    }),
    item({
      name: 'Delete booking',
      method: 'DELETE',
      raw: '{{baseUrl}}/api/v1/bookings/{{bookingId}}',
      pathSegments: ['api', 'v1', 'bookings', ':id'],
      variable: [idVar('id', '{{bookingId}}', 'Required. Booking id to soft-delete.')],
      description: `### DELETE /api/v1/bookings/:id
Soft-delete. The booking leaves the list. Rooms this stay was holding are released, and the dates are no longer blocked.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Booking id. |

No body.

${idNote()}`,
    }),
  ],
};

const userFolder = {
  name: '08 Staff users',
  description: `${authNote('HOTEL_ADMIN for their own hotel. SUPER_ADMIN can manage any hotel and may send hotel_id.')}

A hotel admin can create only \`RECEPTIONIST\`, \`MANAGER\`, \`HOUSEKEEPING\`, and \`ACCOUNTANT\`. A hotel admin cannot create \`SUPER_ADMIN\` or another \`HOTEL_ADMIN\`.

Staff names are not unique. Login emails are unique among active users.

The password is never returned.

${envelope}`,
  item: [
    item({
      name: 'Create staff user',
      method: 'POST',
      events: testScript(saveId('id', 'userId')),
      raw: '{{baseUrl}}/api/v1/users',
      pathSegments: ['api', 'v1', 'users'],
      body: jsonBody({
        name: 'Neha Kulkarni',
        email: 'neha.desk@seaside.example',
        password: 'Desk@123',
        phone: '9876543211',
        role: 'RECEPTIONIST',
        hotel_id: null,
        is_active: true,
        is_disabled: false,
        must_change_password: false,
      }),
      description: `### POST /api/v1/users
${authNote('HOTEL_ADMIN or SUPER_ADMIN.')}

If \`password\` is omitted, the server generates a temporary password, emails a 48-hour setup link, and sets \`must_change_password\` to true.

A hotel admin's \`hotel_id\` in the body is ignored. The new user is attached to the admin's hotel. A super admin should send \`hotel_id\` when the staff member belongs to a property.

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`name\` | string | Yes | Display name. 2 to 100 characters. Not unique. |
| \`email\` | string | Yes | Login email. Stored lowercase. Unique among active users. Booking guest emails are not checked. |
| \`password\` | string | No | Minimum 6 characters. Omit to generate a temporary password and email it. |
| \`phone\` | string | Yes | 5 to 20 characters. |
| \`role\` | string | Yes | \`RECEPTIONIST\`, \`MANAGER\`, \`HOUSEKEEPING\`, or \`ACCOUNTANT\` for a hotel admin. A super admin may also send \`HOTEL_ADMIN\` or \`SUPER_ADMIN\`. |
| \`hotel_id\` | number or null | Super admin only | Hotel to assign. Ignored for a hotel admin. |
| \`is_active\` | boolean | No | Default true. \`false\` blocks login. |
| \`is_disabled\` | boolean | No | Default \`false\`. \`true\` blocks login and every protected API. Use Update account status to change it later. |
| \`must_change_password\` | boolean | No | Default false when a password is sent, true when the server generates one. |

Duplicate email returns 409.

${idNote('Use **List staff users** to read the new user.')}`,
    }),
    item({
      name: 'List staff users',
      method: 'GET',
      events: testScript(saveId('users.0.id', 'userId')),
      raw: '{{baseUrl}}/api/v1/users?page=1&limit=10',
      pathSegments: ['api', 'v1', 'users'],
      query: [
        queryParam('page', '1', 'Optional. Page number, starting at 1.'),
        queryParam('limit', '10', 'Optional. Page size, 1 to 100.'),
        queryParam('search', 'neha', 'Optional. Partial match on name, email, or phone.', true),
        queryParam('role', 'RECEPTIONIST', 'Optional. SUPER_ADMIN, HOTEL_ADMIN, RECEPTIONIST, MANAGER, HOUSEKEEPING, or ACCOUNTANT.', true),
        queryParam('is_active', 'true', 'Optional. true or false.', true),
        queryParam('is_disabled', 'false', 'Optional. true returns only disabled users. false returns users who are not disabled.', true),
        queryParam('hotel_id', '{{hotelId}}', 'Optional for SUPER_ADMIN. Filters one hotel. Ignored for HOTEL_ADMIN, who always see their own hotel.', true),
        queryParam('sort_by', 'created_at', 'Optional. id, name, email, role, is_active, created_at, updated_at, or last_login_at. Default created_at.', true),
        queryParam('sort_order', 'desc', 'Optional. asc or desc. Default desc.', true),
      ],
      description: `### GET /api/v1/users
Hotel admin sees only their hotel. Super admin sees all hotels unless \`hotel_id\` is set. Soft-deleted users are omitted.

**Query keys** are on the Params tab.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`users\` | array | User objects without password. Keys are listed on Get staff user. |
| \`total\` | number | Matching users. |
| \`page\` | number | Current page. |
| \`limit\` | number | Page size. |
| \`total_pages\` | number | Page count. Snake case on this API. Rooms and bookings use \`totalPages\`. |`,
    }),
    item({
      name: 'Get staff user',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/users/{{userId}}',
      pathSegments: ['api', 'v1', 'users', ':id'],
      variable: [idVar('id', '{{userId}}', 'Required. User id.')],
      description: `### GET /api/v1/users/:id
A hotel admin cannot read a user from another hotel.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | User id. |

**Response \`data\`:** one user object. Password is not included.
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | User id. |
| \`name\`, \`email\`, \`phone\` | string | Profile. |
| \`role\` | string | Role code. |
| \`hotel_id\` | number or null | Assigned hotel. |
| \`is_active\` | boolean | Can sign in when true. |
| \`is_disabled\` | boolean | \`false\` by default. \`true\` blocks login and every API. |
| \`must_change_password\` | boolean | Force a password change in the UI. |
| \`failed_login_attempts\` | number | Starts at 0. |
| \`last_login_at\` | string or null | Last login. |
| \`deleted_at\` | null | Null until deleted. |
| \`is_deleted\` | boolean | False until deleted. |
| \`created_at\`, \`updated_at\` | string | Timestamps. |`,
    }),
    item({
      name: 'Update staff user',
      method: 'PUT',
      raw: '{{baseUrl}}/api/v1/users/{{userId}}',
      pathSegments: ['api', 'v1', 'users', ':id'],
      variable: [idVar('id', '{{userId}}', 'Required. User id to update.')],
      body: jsonBody({
        name: 'Neha Kulkarni',
        email: 'neha.desk@seaside.example',
        phone: '9876543211',
        role: 'RECEPTIONIST',
        hotel_id: null,
        is_active: true,
        must_change_password: false,
      }),
      description: `### PUT /api/v1/users/:id
${authNote('HOTEL_ADMIN or SUPER_ADMIN.')}

Send only the keys that change. This API does not set a new password. Password changes go through Forgot password and Reset password.

A hotel admin cannot change \`hotel_id\` to another property, and cannot promote a user to \`HOTEL_ADMIN\` or \`SUPER_ADMIN\`.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | User id. |

**Body keys** — all optional
| Key | Type | Meaning |
| --- | --- | --- |
| \`name\` | string | 2 to 100 characters. |
| \`email\` | string | New login email. Must stay unique. |
| \`phone\` | string | 5 to 20 characters. |
| \`role\` | string | Same role list as create. |
| \`hotel_id\` | number or null | Used by super admin. Ignored as a hotel switch for a hotel admin. |
| \`is_active\` | boolean | false blocks the next login. |
| \`must_change_password\` | boolean | Tell the client to force a password change. |

${idNote('Use **Get staff user** to read the updated user.')}`,
    }),
    item({
      name: 'Update account status',
      method: 'PATCH',
      raw: '{{baseUrl}}/api/v1/users/{{userId}}/account-status',
      pathSegments: ['api', 'v1', 'users', ':id', 'account-status'],
      variable: [idVar('id', '{{userId}}', 'Required. User id. You cannot change your own account.')],
      body: jsonBody({
        is_active: true,
        is_disabled: false,
      }),
      description: `### PATCH /api/v1/users/:id/account-status
${authNote('HOTEL_ADMIN for staff in their hotel. SUPER_ADMIN for any user except their own account.')}

This is the API that turns \`is_active\` and \`is_disabled\` on or off. Send one key or both. At least one is required.

| Flag | true | false |
| --- | --- | --- |
| \`is_active\` | The user can sign in, unless \`is_disabled\` is also true. | Login is rejected. The account is deactivated. |
| \`is_disabled\` | Login is rejected. A token that was already issued is rejected on every protected API. Forgot password and reset password are also rejected. | The user is not disabled. Default for new users. |

A hotel admin cannot change a hotel admin or a super admin. You cannot change your own flags. The last active super admin cannot be disabled or deactivated.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | User id. |

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`is_active\` | boolean | One of the two | \`true\` or \`false\`. |
| \`is_disabled\` | boolean | One of the two | \`true\` or \`false\`. Default on create is \`false\`. |

${idNote('Use **Get staff user** to read \`is_active\` and \`is_disabled\`.')}`,
    }),
    item({
      name: 'Delete staff user',
      method: 'DELETE',
      raw: '{{baseUrl}}/api/v1/users/{{userId}}',
      pathSegments: ['api', 'v1', 'users', ':id'],
      variable: [idVar('id', '{{userId}}', 'Required. User id to soft-delete.')],
      description: `### DELETE /api/v1/users/:id
Soft-delete. The email can be registered again. A user cannot delete their own account.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | User id. |

No body.

${idNote()}`,
    }),
  ],
};

const hotelObjectKeys = `**Hotel object keys**
| Key | Meaning |
| --- | --- |
| \`id\`, \`name\`, \`slug\` | Id, display name, URL slug. The slug never changes after creation. |
| \`owner_id\` | Hotel admin user id. |
| \`owner\` | Owner summary: \`id\`, \`name\`, \`email\`, \`phone\`. |
| \`address\`, \`city\`, \`state\`, \`country\`, \`pincode\` | Location. |
| \`gst_number\`, \`pan_number\` | Tax ids. Empty string when not set. |
| \`bank_name\`, \`bank_account_holder\`, \`bank_account_number\`, \`bank_ifsc_code\`, \`bank_branch\` | Bank details printed on the booking bill and folio PDFs. Empty string when not set. |
| \`total_rooms\`, \`hotel_type\`, \`website\`, \`logo\` | Profile. \`logo\` is a full URL. |
| \`is_active\` | \`true\` by default. When \`false\`, nobody from this hotel can log in or call any API. |
| \`subscription_plan_id\` | Current plan id stored on the hotel. |
| \`subscription.plan_id\`, \`subscription.active\`, \`subscription.start_date\`, \`subscription.end_date\`, \`subscription.auto_renew\` | Current purchase window. The hotel row stores only \`subscription_plan_id\`. |
| \`settings\` | Check-in and check-out time, timezone, currency, tax, GST flag, UPI id, late checkout grace, amenities and policies. |
| \`created_at\`, \`updated_at\`, \`deleted_at\` | Timestamps. \`deleted_at\` is null for a live hotel. |`;

const hotelAdminFolder = {
  name: '09 Hotels (super admin)',
  description: `${authNote('SUPER_ADMIN only. A hotel admin or any other role gets 403.')}

Manage every hotel on the platform. These routes use the same base path as hotel registration: \`/api/v1/hotels\` (also \`/api/v1/hotel\`). \`POST /hotels/register\` stays public.

${envelope}`,
  item: [
    item({
      name: 'Create hotel',
      method: 'POST',
      events: testScript(saveId('id', 'targetHotelId')),
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/hotels',
      pathSegments: ['api', 'v1', 'hotels'],
      body: {
        mode: 'formdata',
        formdata: hotelProvisionFormFields(),
      },
      description: `### POST /api/v1/hotels
${authNote('SUPER_ADMIN only.')}

Creates the hotel as \`ACTIVE\` with the free trial, creates its \`HOTEL_ADMIN\` owner, and emails the owner a temporary password and a 48-hour setup link. Nobody is signed in and no token is returned.

Send multipart/form-data. When there is no logo, the same keys can be sent as JSON. A duplicate \`owner_email\` returns 409.

Every required and optional key is on the Body form-data rows (all optional fields are enabled). Same fields as **Register hotel**.

${hotelProvisionBodyKeysDoc}

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | New hotel id. Saved into \`{{targetHotelId}}\`. |

${idNote('Use **List hotels** or **Get hotel** to read the new hotel.')}`,
    }),
    item({
      name: 'List hotels',
      method: 'GET',
      events: testScript(saveId('hotels.0.id', 'targetHotelId')),
      raw: '{{baseUrl}}/api/v1/hotels?page=1&limit=10',
      pathSegments: ['api', 'v1', 'hotels'],
      query: [
        queryParam('page', '1', 'Optional. Page number, starting at 1.'),
        queryParam('limit', '10', 'Optional. Page size, 1 to 100.'),
        queryParam('search', 'seaside', 'Optional. Partial match on hotel name, slug, city, owner name, owner email, or owner phone.', true),
        queryParam('is_active', 'true', 'Optional. true returns active hotels. false returns deactivated hotels.', true),
        queryParam('subscription_plan_id', '{{planId}}', 'Optional. Only hotels on this plan.', true),
        queryParam('subscription_plan_active', 'true', 'Optional. true or false.', true),
        queryParam('sort_by', 'created_at', 'Optional. id, name, city, is_active, created_at, or updated_at. Default created_at.', true),
        queryParam('sort_order', 'desc', 'Optional. asc or desc. Default desc.', true),
      ],
      description: `### GET /api/v1/hotels
${authNote('SUPER_ADMIN only.')}

Soft-deleted hotels are omitted. The list returns a short object per hotel. Use Get hotel for the full details.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`hotels\` | array | Short hotel objects. Keys below. |
| \`total\` | number | Matching hotels. |
| \`page\` | number | Current page. |
| \`limit\` | number | Page size. |
| \`total_pages\` | number | Page count. |

**Keys of each item in \`hotels\`**
| Key | Meaning |
| --- | --- |
| \`id\`, \`name\`, \`slug\` | Id, display name, URL slug. |
| \`logo_url\` | Full logo URL. Empty string when there is no logo. |
| \`owner.id\`, \`owner.name\`, \`owner.email\`, \`owner.phone\` | Hotel admin who owns the hotel. |
| \`total_rooms\`, \`hotel_type\` | Room count and hotel type. |
| \`address\`, \`city\`, \`state\`, \`country\` | Location. |
| \`is_active\` | \`false\` means the hotel is switched off. |
| \`subscription.plan_id\` | Plan id. Null when no plan is set. |
| \`subscription.plan_name\`, \`subscription.plan_code\`, \`subscription.billing_cycle\`, \`subscription.price\`, \`subscription.max_rooms\` | Details of the plan. Null when no plan is set. |
| \`subscription.active\`, \`subscription.start_date\`, \`subscription.end_date\`, \`subscription.auto_renew\` | This hotel's subscription window and auto renew. |
| \`created_at\`, \`updated_at\`, \`deleted_at\` | Timestamps. \`deleted_at\` is always null here. |`,
    }),
    item({
      name: 'Get hotel',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/hotels/{{targetHotelId}}',
      pathSegments: ['api', 'v1', 'hotels', ':id'],
      variable: [idVar('id', '{{targetHotelId}}', 'Required. Hotel id.')],
      description: `### GET /api/v1/hotels/:id
${authNote('SUPER_ADMIN only.')}

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Hotel id. Returns 404 when the hotel does not exist or was deleted. |

**Response \`data\`:** one hotel object.

${hotelObjectKeys}`,
    }),
    item({
      name: 'Update hotel',
      method: 'PUT',
      headers: acceptHeader(),
      raw: '{{baseUrl}}/api/v1/hotels/{{targetHotelId}}',
      pathSegments: ['api', 'v1', 'hotels', ':id'],
      variable: [idVar('id', '{{targetHotelId}}', 'Required. Hotel id to update.')],
      body: {
        mode: 'formdata',
        formdata: [
          textField('name', 'Seaside Residency', 'Optional. Hotel display name. Max 150 characters. Cannot be empty when sent.'),
          textField('address', '12 Marine Drive', 'Optional. Street address. Cannot be empty when sent.'),
          textField('city', 'Mumbai', 'Optional. Max 100 characters. Cannot be empty when sent.'),
          textField('state', 'Maharashtra', 'Optional. Max 100 characters. Cannot be empty when sent.'),
          textField('country', 'India', 'Optional. Max 100 characters.'),
          textField('pincode', '400001', 'Optional. 6-digit Indian PIN code.'),
          textField('gst_number', '27AAAAA0000A1Z5', 'Optional. 15-character GSTIN. Empty clears it. Does not change gst_enabled. Stored uppercase.'),
          textField('pan_number', 'AAAAA0000A', 'Optional. 10-character PAN. Empty clears it. Stored uppercase.'),
          textField('bank_name', 'HDFC Bank', 'Optional. Bank name printed on bills and folios. Empty clears it. Max 150 characters.'),
          textField('bank_account_holder', 'Seaside Residency', 'Optional. Account holder name. Empty clears it. Max 150 characters.'),
          textField('bank_account_number', '123456789012', 'Optional. 9 to 18 digits. Empty clears it.'),
          textField('bank_ifsc_code', 'HDFC0001234', 'Optional. 11-character IFSC. Empty clears it. Stored uppercase.'),
          textField('bank_branch', 'Marine Drive, Mumbai', 'Optional. Branch name. Empty clears it. Max 150 characters.'),
          textField('hotel_type', 'Boutique Hotel', 'Optional. Free text, max 100 characters.'),
          textField('website', 'https://seaside.example', 'Optional. Valid URL. A missing http:// is accepted and treated as https.'),
          ...hotelSettingsFormFields(),
          textField('total_rooms', '24', 'Optional. Whole number, 0 or more. Inventory count only. It does not create rooms.'),
          fileField('logo', 'Optional file. Replaces the current logo. Field name logo, logo_image, or file. JPEG, PNG, WebP, GIF, SVG, or AVIF. Max 10 MB.'),
          textField('subscription_plan_id', '{{planId}}', 'Optional. Existing plan id from Subscription Plans. Unknown id returns 404.'),
          textField('subscription_plan_active', 'true', 'Optional. true or false.'),
          textField('subscription_plan_start_date', '2026-10-14', 'Optional. ISO date (YYYY-MM-DD or full ISO). Empty clears it.'),
          textField('subscription_plan_end_date', '2027-10-14', 'Optional. ISO date. Empty clears it. A missing end date means the plan never expires.'),
          textField('auto_renew', 'false', 'Optional. true or false.'),
        ],
      },
      description: `### PUT /api/v1/hotels/:id
${authNote('SUPER_ADMIN only.')}

Send only the keys that change. At least one key is required. The slug and the owner account do not change here. Owner and staff accounts are managed in Staff users. To switch a hotel on or off use **Update hotel active status**.

Send multipart/form-data. When there is no logo, the same keys can be sent as JSON. Every optional key is on the Body form-data rows and is enabled.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Hotel id. |

**Accepted body keys** (all optional; send at least one)
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`name\` | string | No | Hotel display name. Max 150. Cannot be empty when sent. |
| \`address\` | string | No | Street address. Cannot be empty when sent. |
| \`city\` | string | No | Max 100. Cannot be empty when sent. |
| \`state\` | string | No | Max 100. Cannot be empty when sent. |
| \`country\` | string | No | Max 100. |
| \`pincode\` | string | No | 6-digit Indian PIN code. |
| \`gst_number\` | string | No | 15-character GSTIN. Empty clears it. Does not change \`gst_enabled\`. Stored uppercase. |
| \`pan_number\` | string | No | 10-character PAN. Empty clears it. Stored uppercase. |
| \`bank_name\` | string | No | Bank name on bills and folios. Empty clears it. Max 150. |
| \`bank_account_holder\` | string | No | Account holder name. Empty clears it. Max 150. |
| \`bank_account_number\` | string | No | 9 to 18 digits. Empty clears it. |
| \`bank_ifsc_code\` | string | No | 11-character IFSC. Empty clears it. Stored uppercase. |
| \`bank_branch\` | string | No | Branch name. Empty clears it. Max 150. |
| \`hotel_type\` | string | No | Free text, max 100. |
| \`website\` | string | No | Valid URL. |
${hotelSettingsBodyKeysDoc}
| \`total_rooms\` | number | No | Whole number, 0 or more. Does not create rooms. |
| \`logo\` | file | No | Replaces the current logo. Max 10 MB. |
| \`subscription_plan_id\` | number | No | Existing plan id. Unknown id returns 404. |
| \`subscription_plan_active\` | boolean | No | true or false. |
| \`subscription_plan_start_date\` | string | No | ISO date. Empty clears it. |
| \`subscription_plan_end_date\` | string | No | ISO date. Empty clears it. |
| \`auto_renew\` | boolean | No | true or false. |

**Not changed here**
| Key | Note |
| --- | --- |
| \`slug\`, \`owner_email\`, \`owner_phone\` | Never changed by this API. |
| \`is_active\` | Use **Update hotel active status**. |

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Updated hotel id. |

${idNote('Use **Get hotel** to read the updated hotel.')}`,
    }),
    item({
      name: 'Update hotel active status',
      method: 'PATCH',
      raw: '{{baseUrl}}/api/v1/hotels/{{targetHotelId}}/active-status',
      pathSegments: ['api', 'v1', 'hotels', ':id', 'active-status'],
      variable: [idVar('id', '{{targetHotelId}}', 'Required. Hotel id.')],
      body: jsonBody({
        is_active: false,
      }),
      description: `### PATCH /api/v1/hotels/:id/active-status
${authNote('SUPER_ADMIN only.')}

This is the only API that switches a hotel on or off. New hotels are \`is_active: true\`.

| \`is_active\` | What happens |
| --- | --- |
| \`false\` | Every user of the hotel is blocked at once. Login, refresh token, forgot password and reset password return 403. A token that was already issued returns 403 on every protected API. Connected Socket.IO clients are dropped. Nothing is deleted. |
| \`true\` | The hotel works again. Existing users and tokens work as before. |

A super admin is never blocked and can still read and edit a deactivated hotel.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Hotel id. |

**Body keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`is_active\` | boolean | Yes | \`true\` or \`false\`. |

**Blocked users see:** 403 with the message \`This hotel has been deactivated. Please contact the platform administrator.\`

The same full-hotel block applies when \`subscription.active\` is false or \`subscription.end_date\` has passed. Renew the plan with **Update hotel**.

${idNote('Use **Get hotel** to read \`is_active\`.')}`,
    }),
    item({
      name: 'Delete hotel',
      method: 'DELETE',
      raw: '{{baseUrl}}/api/v1/hotels/{{targetHotelId}}',
      pathSegments: ['api', 'v1', 'hotels', ':id'],
      variable: [idVar('id', '{{targetHotelId}}', 'Required. Hotel id to soft-delete.')],
      description: `### DELETE /api/v1/hotels/:id
${authNote('SUPER_ADMIN only.')}

Soft-delete. The hotel disappears from every list and its owner and staff can no longer sign in. Their owner email can be registered again. Rooms and bookings stay in the database. Super admins are not affected.

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Hotel id. |

No body.

${idNote()}`,
    }),
  ],
};

const auditFolder = {
  name: '10 Audit logs',
  description: `${authNote('HOTEL_ADMIN or SUPER_ADMIN. Any other role gets 403.')}

Read-only history of who did what. Entries are written by the server and cannot be changed or deleted through the API.

A hotel admin sees only the logs of their own hotel. The \`hotel_id\` filter is ignored for them. A super admin sees every hotel and can filter with \`hotel_id\`.

**Recorded actions (\`action\`)**
| Value | When |
| --- | --- |
| \`CREATE\` | A hotel, user, subscription plan, room category, room, or booking is created. Public hotel registration is included. |
| \`UPDATE\` | The same records are edited. \`changes\` lists only the fields that changed. |
| \`DELETE\` | The same records are deleted. |
| \`STATUS_CHANGE\` | Hotel active status, user account status, room status, or booking status changes. |
| \`CHECK_OUT\` | A booking is checked out. |
| \`LOGIN\` | A successful login. |
| \`LOGIN_FAILED\` | A wrong password for an existing account. |
| \`PASSWORD_RESET\` | A password is set with a reset link. |

**Record types (\`entity_type\`):** \`HOTEL\`, \`USER\`, \`SUBSCRIPTION_PLAN\`, \`ROOM_TYPE\`, \`ROOM\`, \`BOOKING\`. Login events use \`USER\`.

**Failed actions.** A change (create, update, delete, status change, check-out) that is rejected or hits an error is also recorded, with \`status: "FAILED"\`. Use it to find who tried what, when, and why it failed. Failed entries carry \`status_code\` (the HTTP status the caller got), \`error_message\` (the reason, and for a server error the real cause), and \`error_details\` (field errors, for example from validation). A completed action has \`status: "SUCCESS"\` and these three keys are null. Only signed-in users are recorded, so unauthenticated calls and read (GET) errors are not. A \`LOGIN_FAILED\` entry is always \`FAILED\` and shows why the login was refused (wrong password, disabled, deactivated, locked, or hotel off).

Passwords are never stored in the logs. Logout and automatic server jobs (for example a room becoming available after cleaning) are not recorded.

${envelope}`,
  item: [
    item({
      name: 'List audit logs',
      method: 'GET',
      events: testScript(saveId('audit_logs.0.id', 'auditLogId')),
      raw: '{{baseUrl}}/api/v1/audit-logs?page=1&limit=10',
      pathSegments: ['api', 'v1', 'audit-logs'],
      query: [
        queryParam('page', '1', 'Optional. Page number, starting at 1. Default 1.'),
        queryParam('limit', '10', 'Optional. Page size, 1 to 100. Default 10.'),
        queryParam('action', 'UPDATE', 'Optional. CREATE, UPDATE, DELETE, STATUS_CHANGE, CHECK_OUT, LOGIN, LOGIN_FAILED, or PASSWORD_RESET. Case-insensitive.', true),
        queryParam('status', 'FAILED', 'Optional. SUCCESS or FAILED. FAILED lists the errors only. Case-insensitive.', true),
        queryParam('entity_type', 'BOOKING', 'Optional. HOTEL, USER, SUBSCRIPTION_PLAN, ROOM_TYPE, ROOM, or BOOKING. Case-insensitive.', true),
        queryParam('entity_id', '12', 'Optional. Id of the record. Use with entity_type to see one record history.', true),
        queryParam('user_id', '3', 'Optional. Only actions done by this user.', true),
        queryParam('hotel_id', '{{targetHotelId}}', 'Optional. SUPER_ADMIN only. Ignored for a hotel admin.', true),
        queryParam('from_date', '2026-10-01', 'Optional. ISO date. Logs on or after this date.', true),
        queryParam('to_date', '2026-10-31', 'Optional. ISO date. Logs on or before this date.', true),
        queryParam('search', 'Ravi', 'Optional. Partial match on the description or the user name.', true),
        queryParam('sort_order', 'desc', 'Optional. asc or desc. Default desc (newest first).', true),
      ],
      description: `### GET /api/v1/audit-logs
${authNote('HOTEL_ADMIN or SUPER_ADMIN.')}

**Query keys** are on the Params tab. Only page and limit are sent until you enable the others.

**Response \`data\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`audit_logs\` | array | Log entries. Keys below. |
| \`total\` | number | Matching entries. |
| \`page\` | number | Current page. |
| \`limit\` | number | Page size. |
| \`total_pages\` | number | Page count. |

**Keys of each item in \`audit_logs\`**
| Key | Type | Meaning |
| --- | --- | --- |
| \`id\` | number | Log id. |
| \`hotel_id\` | number or null | Hotel the action belongs to. |
| \`user.id\`, \`user.name\`, \`user.role\` | number, string, string | Who did it. |
| \`action\` | string | See the folder note. |
| \`status\` | string | \`SUCCESS\` or \`FAILED\`. |
| \`status_code\` | number or null | HTTP status of a failed action. |
| \`error_message\` | string or null | Why a failed action failed. |
| \`error_details\` | array or null | Field errors of a failed action, each \`{ field, message }\`. |
| \`entity_type\` | string | Type of record. |
| \`entity_id\` | number or null | Id of the record. |
| \`description\` | string | Short readable summary. |
| \`changes\` | object or null | For \`UPDATE\` and \`STATUS_CHANGE\`. Each changed field is \`{ "field": { "from": old, "to": new } }\`. |
| \`request_data\` | object or null | The data the caller sent: body fields, plus \`files\` (\`field_name\`, \`file_name\`, \`size\`) for uploads. Passwords, tokens and secrets show as \`[REDACTED]\`. Null when nothing was sent. |
| \`ip_address\`, \`user_agent\` | string or null | Caller details. |
| \`created_at\` | string | When it happened. |`,
    }),
    item({
      name: 'Get audit log',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/audit-logs/{{auditLogId}}',
      pathSegments: ['api', 'v1', 'audit-logs', ':id'],
      variable: [idVar('id', '{{auditLogId}}', 'Required. Audit log id.')],
      description: `### GET /api/v1/audit-logs/:id
${authNote('HOTEL_ADMIN or SUPER_ADMIN.')}

**Path keys**
| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| \`id\` | number | Yes | Audit log id. |

Returns one entry with the keys listed under **List audit logs** in \`data\`. A log of another hotel returns 403 for a hotel admin. A missing id returns 404.`,
    }),
  ],
};

const dashboardFolder = {
  name: '11 Dashboard',
  description: `${authNote('Any authenticated hotel role, or SUPER_ADMIN.')}

One endpoint. The server reads the role from the access token and returns the matching dashboard.

| Role | Response |
| --- | --- |
| \`SUPER_ADMIN\` | Platform KPIs and plan distribution. Send \`hotel_id\` to open that hotel's admin dashboard instead. |
| \`HOTEL_ADMIN\` | Hotel KPIs, today's pulse, room status, revenue by payment method, and subscription quota. |
| \`RECEPTIONIST\`, \`MANAGER\`, \`HOUSEKEEPING\`, \`ACCOUNTANT\` | Today's shift collections and room status summary. |

Optional query \`date_range\`: \`today\`, \`this_week\`, \`this_month\` (default), or \`this_year\`. It scopes platform booking volume / hotel \`month_revenue\` and \`revenue_by_payment_method\`. Today's fields always use the current calendar day.

${envelope}`,
  item: [
    item({
      name: 'Get dashboard',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/dashboard?date_range=this_month',
      pathSegments: ['api', 'v1', 'dashboard'],
      query: [
        queryParam('date_range', 'this_month', 'Optional. today, this_week, this_month, or this_year. Default this_month.'),
        queryParam('hotel_id', '{{targetHotelId}}', 'Optional. SUPER_ADMIN only. Opens that hotel\'s admin dashboard instead of the platform dashboard.', true),
        queryParam('floor', '1', 'Optional. Reserved for front-desk room rack filtering. Ignored by the current response shape.', true),
      ],
      description: `### GET /api/v1/dashboard
${authNote('SUPER_ADMIN, HOTEL_ADMIN, RECEPTIONIST, MANAGER, HOUSEKEEPING, or ACCOUNTANT.')}

**Super admin \`data\`**
| Key | Meaning |
| --- | --- |
| \`kpis.total_hotels\`, \`active_hotels\`, \`inactive_hotels\` | Hotels on the platform (not soft-deleted). |
| \`kpis.trial_hotels\` | Hotels still inside an active TRIAL plan window. |
| \`kpis.expired_hotels\` | Hotels whose plan is inactive or past \`subscription.end_date\`. |
| \`kpis.estimated_mrr\` | Monthly revenue from active hotels whose current purchase is paid and unexpired. Uses the purchase amount. \`ANNUAL\` is divided by 12. |
| \`kpis.total_platform_rooms\`, \`total_staff_users\` | Non-deleted rooms and non-super-admin users. |
| \`kpis.total_bookings_this_month\`, \`total_platform_booking_volume\` | Booking count and \`total_amount\` sum for \`date_range\`. |
| \`plan_distribution[]\` | Per plan: \`plan_id\`, \`plan_name\`, \`active_hotels_count\`, \`monthly_revenue\`. |

**Hotel admin \`data\`**
| Key | Meaning |
| --- | --- |
| \`hotel\` | \`id\`, \`name\`, \`slug\`, \`currency\`, \`tax_percentage\`, \`gst_enabled\`. |
| \`kpis.today_revenue\` | Collections recorded today (\`booking_payments\` PAID / PARTIALLY_PAID). |
| \`kpis.month_revenue\` | Collections in \`date_range\`. |
| \`kpis.total_outstanding_due\` | Sum of \`due_amount\` on open bookings. |
| \`kpis.occupancy_rate_percentage\` | Current OCCUPIED rooms / total rooms. |
| \`today_pulse\` | Checked in today, expected check-outs today, checked out today, in-house guests. |
| \`room_status_summary\` | Counts for every room status. |
| \`revenue_by_payment_method\` | Collections in \`date_range\` by method. |
| \`room_status_graph\` | HOTEL_ADMIN only. \`total_rooms\` and \`statuses[]\`, one entry per room status with \`status\`, \`count\` and \`percentage\` (share of the hotel's rooms, 2 decimals). |
| \`weekly_revenue_graph\` | HOTEL_ADMIN only. Seven entries, Monday to Sunday of the current week, each with \`date\` (YYYY-MM-DD), \`day\` (for example \`Monday\`) and \`revenue\`. Revenue is the collected payments (\`booking_payments\` PAID / PARTIALLY_PAID) of that day. A day with no payments, or a day still to come, is \`0\`. Not affected by \`date_range\`. |
| \`subscription_quota\` | Plan limit and rooms used, plus \`plan_start_date\`, \`plan_end_date\`, \`days_left\`, and \`is_active\` from the current purchase. \`is_active\` is false when that purchase is not paid or its end date has passed. |

**Front desk \`data\`**
| Key | Meaning |
| --- | --- |
| \`shift_collections_today\` | Cash / UPI / card / online totals and \`total_shift_collected\` for today. |
| \`room_status_summary\` | Counts for every room status. |`,
    }),
  ],
};

const reportFolder = {
  name: '12 Reports',
  description: `${authNote('HOTEL_ADMIN or ACCOUNTANT of the hotel. SUPER_ADMIN may read any hotel and must send hotel_id.')}

**GST report.** Date-wise GST data built from the bookings of the logged-in hotel.

How the data is derived (there is no invoice table):
- One booking is one invoice. \`invoice_number\` is the booking number. \`invoice_date\` is the actual check-out date, or the scheduled check-out date while the guest has not left. The payment date is never used.
- An invoice has up to two lines. \`ROOM_BOOKING\` carries the taxable value and the CGST / SGST saved on the booking. \`OTHER_CHARGES\` is the part of the invoice total that carries no GST (extra charges and the late check-out charge), at 0%.
- Tax is not recalculated. The rate and amounts saved on each booking are used, so a later rate change does not alter an old report.
- A cancelled or no-show booking (\`invoice_status\` \`CANCELLED\`) is reversed by a credit note for its full taxable value and tax. Net values are gross minus credit notes. Refunds are shown for information and do not change tax.
- IGST, cess and guest GSTIN are not stored on bookings, so they are \`0\` and \`null\`. Restaurant, banquet and laundry services are not in the database.

${envelope}`,
  item: [
    item({
      name: 'GST report',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/reports/gst?start_date=2026-10-01&end_date=2026-10-31&page=1&limit=50',
      pathSegments: ['api', 'v1', 'reports', 'gst'],
      query: [
        queryParam('start_date', '2026-10-01', 'Required. YYYY-MM-DD, first day of the report, inclusive.'),
        queryParam('end_date', '2026-10-31', 'Required. YYYY-MM-DD, last day of the report, inclusive. The period can be at most 366 days.'),
        queryParam('gst_rate', '18', 'Optional. Only lines with this GST rate. 0 gives the lines without GST.', true),
        queryParam('service_type', 'ROOM_BOOKING', 'Optional. ROOM_BOOKING or OTHER_CHARGES.', true),
        queryParam('invoice_status', 'FINAL', 'Optional. FINAL (checked out), PROVISIONAL (not checked out yet), or CANCELLED (cancelled or no-show).', true),
        queryParam('page', '1', 'Optional. Default 1.'),
        queryParam('limit', '50', 'Optional. Default 50, maximum 200.'),
        queryParam('hotel_id', '{{targetHotelId}}', 'SUPER_ADMIN only and required for them. Ignored for hotel staff, whose hotel comes from the token.', true),
      ],
      description: `### GET /api/v1/reports/gst
${authNote('HOTEL_ADMIN, ACCOUNTANT, or SUPER_ADMIN (with hotel_id).')}

**Response \`data\`**
| Key | Meaning |
| --- | --- |
| \`filters\` | \`hotel_id\`, \`start_date\`, \`end_date\` and the filters applied. |
| \`hotel\` | Registered business details: \`name\`, \`gstin\`, \`pan\`, address, city, state, pincode. |
| \`rows[]\` | One line per invoice and service, oldest invoice date first. One page. |
| \`date_wise_summary[]\` | One entry per invoice date with totals. Not paginated. |
| \`gst_rate_summary[]\` | One entry per GST rate. |
| \`service_summary[]\` | One entry per service type with \`service_label\` and \`hsn_sac_code\`. |
| \`grand_totals\` | Totals of the whole period, not only the page. |
| \`pagination\` | \`page\`, \`limit\`, \`total_rows\` (lines), \`total_pages\`. |
| \`notes\` | How the figures are derived and what is not stored. |

**Row keys**
| Key | Meaning |
| --- | --- |
| \`invoice_date\`, \`invoice_number\` | Check-out date (YYYY-MM-DD) and booking number. |
| \`booking_id\`, \`guest_name\`, \`guest_gstin\` | Booking and guest. \`guest_gstin\` is always null today. |
| \`room_count\` | Rooms on the booking. The amounts are for the whole booking and are never repeated per room. |
| \`service_type\`, \`hsn_sac_code\` | \`ROOM_BOOKING\` (996311) or \`OTHER_CHARGES\` (999799). |
| \`gross_amount\`, \`discount_amount\`, \`taxable_amount\` | Amount before discount, the discount, and the value GST is charged on. |
| \`gst_rate\` | Rate saved on the booking. 0 for \`OTHER_CHARGES\`. |
| \`cgst_amount\`, \`sgst_amount\`, \`igst_amount\`, \`cess_amount\`, \`gst_total\` | Tax of this line. IGST and cess are 0. |
| \`line_total\`, \`invoice_total\` | Taxable value plus GST of this line, and the stored total of the whole invoice. |
| \`invoice_status\`, \`booking_status\` | \`FINAL\`, \`PROVISIONAL\` or \`CANCELLED\`, and the stay status. |
| \`refunded_amount\` | Money refunded on the booking. Shown on the \`ROOM_BOOKING\` line. Information only. |
| \`credit_note\` | \`taxable_value\`, tax amounts and \`gst_total\` reversed for a cancelled invoice. Zero otherwise. |
| \`net_taxable_value\` | \`taxable_amount\` minus the credit note. |

**Summary keys** (date, rate, service and grand totals)
| Key | Meaning |
| --- | --- |
| \`total_invoices\` | Invoices counted once. In the rate and service summaries an invoice is counted once in every group it has lines in. |
| \`gross_amount\`, \`discount_amount\` | Before and discount. |
| \`total_taxable_value\`, \`total_cgst\`, \`total_sgst\`, \`total_igst\`, \`total_cess\`, \`total_gst\` | Taxable value and tax. |
| \`total_invoice_value\` | Taxable value plus GST. |
| \`credit_note_count\`, \`credit_note_taxable_value\`, \`credit_note_cgst\`, \`credit_note_sgst\`, \`credit_note_igst\`, \`credit_note_cess\`, \`credit_note_gst\`, \`credit_note_total\` | Credit notes for cancelled invoices. |
| \`net_taxable_value\`, \`net_gst\` | After credit notes. |
| \`refunded_amount\` | Refunds on these invoices. |

Errors: 400 for a missing or bad date, a period over 366 days, an unknown filter value, or a missing \`hotel_id\` for a super admin. 403 for other roles.`,
    }),
    item({
      name: 'Export GST report (Excel or PDF)',
      method: 'GET',
      raw: '{{baseUrl}}/api/v1/reports/gst/export?format=xlsx&start_date=2026-10-01&end_date=2026-10-31',
      pathSegments: ['api', 'v1', 'reports', 'gst', 'export'],
      query: [
        queryParam('format', 'xlsx', 'Required. xlsx or pdf.'),
        queryParam('start_date', '2026-10-01', 'Required. YYYY-MM-DD, inclusive.'),
        queryParam('end_date', '2026-10-31', 'Required. YYYY-MM-DD, inclusive. At most 366 days after start_date.'),
        queryParam('gst_rate', '18', 'Optional. Same as the report.', true),
        queryParam('service_type', 'ROOM_BOOKING', 'Optional. Same as the report.', true),
        queryParam('invoice_status', 'FINAL', 'Optional. Same as the report.', true),
        queryParam('hotel_id', '{{targetHotelId}}', 'SUPER_ADMIN only and required for them.', true),
      ],
      description: `### GET /api/v1/reports/gst/export
${authNote('HOTEL_ADMIN, ACCOUNTANT, or SUPER_ADMIN (with hotel_id).')}

Builds the whole report (no paging) as a file and returns a link to it. Both files hold the same tables: totals, date-wise summary, GST rate summary, service summary, invoice details and notes. The Excel file has them on one sheet, top to bottom. The PDF is A4 landscape, black and white. The file is saved under uploads/pdfs and every PDF and Excel file there is deleted by the clean-up job every 3 hours.

A report of more than 5000 rows is refused with 400. Choose a shorter period or add a filter.

**Response \`data\`**
| Key | Meaning |
| --- | --- |
| \`url\` | Link that downloads the file. |
| \`file_name\` | File name. |
| \`format\` | \`xlsx\` or \`pdf\`. |
| \`row_count\` | Detail rows in the file. |`,
    }),
  ],
};

collection.item = [
  healthFolder,
  authFolder,
  hotelFolder,
  planFolder,
  roomTypeFolder,
  roomFolder,
  bookingFolder,
  userFolder,
  hotelAdminFolder,
  auditFolder,
  dashboardFolder,
  reportFolder,
];

const outputPath = path.join(__dirname, '..', 'postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), 'utf8');

const requestCount = collection.item.reduce((sum, folder) => sum + folder.item.length, 0);
console.log(`Wrote ${outputPath}`);
console.log(`Folders: ${collection.item.length}`);
console.log(`Requests: ${requestCount}`);
collection.item.forEach((folder) => {
  console.log(`  ${folder.name}: ${folder.item.length}`);
});
