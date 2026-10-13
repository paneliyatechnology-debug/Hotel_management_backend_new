/**
 * Postman Collection Generator for Hotel Management Backend.
 * Generates a complete, professional Postman v2.1.0 collection file.
 */
const fs = require('fs');
const path = require('path');

const collection = {
  info: {
    _postman_id: "hotel-management-backend-complete-api-v1",
    name: "Hotel Management Backend - Complete API Collection (TradeNexa Architecture)",
    description: `# 🏨 Hotel Management Backend API Collection\n\nProduction-ready Postman collection covering 100% of the APIs for the **Hotel Management Backend** (Node.js + Express.js + MySQL Knex), built following the **TradeNexa Architecture**.\n\n---\n\n## 🌟 Collection Highlights\n- **Folder-Wise Modular Structure**: Health Check, Authentication, Hotel Onboarding, Subscription Plans, Room Categories, Physical Rooms, Bookings Management, and Staff Management.\n- **Full Parameter & Body Documentation**: Every request includes markdown descriptions with comprehensive tables for all required and optional fields, constraints, and validation rules.\n- **Automated Token & ID Propagation**: Pre-request and Test scripts automatically capture \`accessToken\`, \`refreshToken\`, \`hotelId\`, \`roomTypeId\`, \`roomId\`, \`bookingId\`, \`userId\`, and \`planId\` into collection variables upon successful creation/login.\n- **RBAC & Security**: Configured with collection-level Bearer Token authorization (\`{{accessToken}}\`) and dual HTTP-Only cookie support.\n- **Standardized Responses**: Every endpoint returns \`{ success: true, message: "...", data: { ... } }\` on success, or \`{ success: false, message: "...", errors: [...] }\` on error.\n\n---\n\n## 🚀 Quick Start Guide\n1. Import this JSON file directly into Postman (**File -> Import**).\n2. Ensure the backend server is running (\`npm run dev\` at \`http://localhost:5000\`).\n3. Execute **Authentication -> Login User** with initial credentials (\`admin@hotel.com\` / \`Admin@123\`). The \`accessToken\` is automatically stored in collection variables.\n4. Execute requests down the list in order: register hotel, create room category, create room, create booking, manage staff!`,
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:5000", type: "string", description: "Base URL of the backend API server" },
    { key: "accessToken", value: "", type: "string", description: "JWT Access token auto-captured from login or registration" },
    { key: "refreshToken", value: "", type: "string", description: "JWT Refresh token auto-captured from login" },
    { key: "hotelId", value: "1", type: "string", description: "Default or active Hotel Property ID" },
    { key: "roomTypeId", value: "1", type: "string", description: "Active Room Category / Type ID" },
    { key: "roomId", value: "1", type: "string", description: "Active Physical Room ID" },
    { key: "bookingId", value: "1", type: "string", description: "Active Booking ID" },
    { key: "userId", value: "1", type: "string", description: "Active Staff / User ID" },
    { key: "planId", value: "1", type: "string", description: "Active Subscription Plan ID" },
    { key: "resetToken", value: "", type: "string", description: "Password reset token captured from email or API" }
  ],
  auth: {
    type: "bearer",
    bearer: [
      { key: "token", value: "{{accessToken}}", type: "string" }
    ]
  },
  item: []
};

// Helper to build headers
const jsonHeaders = () => [
  { key: "Content-Type", value: "application/json", type: "text" },
  { key: "Accept", value: "application/json", type: "text" }
];

const multipartHeaders = () => [
  { key: "Accept", value: "application/json", type: "text" }
];

// Helper to build URL object
const buildUrl = (raw, query = [], variable = []) => {
  const parts = raw.replace('{{baseUrl}}/', '').split('?')[0].split('/');
  return {
    raw,
    host: ["{{baseUrl}}"],
    path: parts,
    query: query.length > 0 ? query : undefined,
    variable: variable.length > 0 ? variable : undefined
  };
};

// =========================================================================
// 1. HEALTH CHECK FOLDER
// =========================================================================
const healthFolder = {
  name: "1. Health & System Diagnostics",
  description: "Server uptime and API namespace diagnostics endpoints. Useful for health checks, load balancers, and monitoring systems.",
  item: [
    {
      name: "Root Server Health Check",
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/health"),
        description: "### Health Check (Root)\nVerifies that the Node.js Express server process is running and accepting HTTP requests.\n\n- **Access:** Public (No authentication required)\n- **Response:** \n```json\n{\n  \"success\": true,\n  \"message\": \"Server is running\",\n  \"data\": { \"status\": \"UP\" }\n}\n```"
      }
    },
    {
      name: "API Namespace Health Check",
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/health"),
        description: "### Health Check (API Namespace)\nVerifies that the `/api` route prefix and routing middleware are actively responding.\n\n- **Access:** Public (No authentication required)"
      }
    }
  ]
};

// =========================================================================
// 2. AUTHENTICATION FOLDER
// =========================================================================
const authFolder = {
  name: "2. Authentication",
  description: "Complete authentication flows implementing the TradeNexa dual-token architecture: Login, Refresh Token rotation, Logout, Password Reset with cryptographically secure single-use tokens, and Authenticated Profile inspection.",
  item: [
    {
      name: "Login User",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 200) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.accessToken) {",
              "        pm.collectionVariables.set('accessToken', res.data.accessToken);",
              "        console.log('✅ Access Token updated in collection variables');",
              "    }",
              "    if (res.data && res.data.refreshToken) {",
              "        pm.collectionVariables.set('refreshToken', res.data.refreshToken);",
              "        console.log('✅ Refresh Token updated in collection variables');",
              "    }",
              "    if (res.data && res.data.user && res.data.user.hotel_id) {",
              "        pm.collectionVariables.set('hotelId', String(res.data.user.hotel_id));",
              "        console.log('✅ Active hotelId set to: ' + res.data.user.hotel_id);",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            email: "admin@hotel.com",
            password: "Admin@123"
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/auth/login"),
        description: `### User Login
Authenticates an existing user account using email and password.
- Sets secure \`accessToken\` and \`refreshToken\` as HTTP-Only cookies.
- Returns JWT tokens in response body for Bearer token authorization.
- Test script automatically saves \`accessToken\` to collection variable \`{{accessToken}}\`.

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`email\` | String | **Required** | Registered account email address (e.g. \`admin@hotel.com\`) |
| \`password\` | String | **Required** | User password |

#### Initial Seeded Super Admin Credentials
- **Email:** \`admin@hotel.com\`
- **Password:** \`Admin@123\`
- **Role:** \`SUPER_ADMIN\``
      }
    },
    {
      name: "Refresh Access Token",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 200) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.accessToken) {",
              "        pm.collectionVariables.set('accessToken', res.data.accessToken);",
              "        console.log('✅ Refreshed Access Token saved to collection variables');",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            refreshToken: "{{refreshToken}}"
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/auth/refresh-token"),
        description: `### Rotate & Refresh Access Token
Issues a new JWT access token using the active refresh session.
- Automatically reads the \`refreshToken\` HTTP-only cookie if sent by browser.
- Alternatively reads \`refreshToken\` passed in the JSON body.
- Rotates access token and updates collection variable \`{{accessToken}}\`.

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`refreshToken\` | String | *Optional* (if cookie present) | The 30-day refresh token issued during login |`
      }
    },
    {
      name: "Logout User",
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/auth/logout"),
        description: `### User Logout
Clears the session cookies (\`accessToken\`, \`refreshToken\`) on the client.
- **Access:** Public / Session holder
- **Response:** \`{ "success": true, "message": "Logged out successfully.", "data": null }\``
      }
    },
    {
      name: "Forgot Password (Request Reset Link)",
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            email: "admin@hotel.com"
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/auth/forgot-password"),
        description: `### Forgot Password
Generates a cryptographically secure single-use reset token and dispatches an HTML password reset email containing a secure CTA link button.

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`email\` | String | **Required** | Registered user email address |`
      }
    },
    {
      name: "Reset Password with Token",
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            token: "{{resetToken}}",
            password: "NewPassword@123"
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/auth/reset-password"),
        description: `### Reset Password
Updates user's password using the validated reset token.
- Hashes new password with Bcrypt.
- Invalidates the single-use token to prevent replay attacks.
- Resets failed login attempt counters and clears temporary lockouts.

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`token\` | String | **Required** | Valid unexpired reset token |
| \`password\` | String | **Required** | New password (minimum 6 characters) |`
      }
    },
    {
      name: "Get Current Authenticated Profile",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/auth/me"),
        description: `### Get Current User Profile (/me)
Retrieves the profile of the authenticated user whose token is in the Authorization header.
- Returns user ID, name, email, phone, role, status, hotel ID, and permissions.
- **Access:** Requires Bearer Token (\`{{accessToken}}\`)`
      }
    }
  ]
};

// =========================================================================
// 3. HOTEL ONBOARDING FOLDER
// =========================================================================
const hotelFolder = {
  name: "3. Hotel Onboarding & Registration",
  description: "Self-serve hotel registration and property onboarding. Supports multipart/form-data for uploading hotel logo directly to AWS S3. Uses the Temporary Password & Password Reset Link flow: automatically provisions the Hotel Admin user with a cryptographically secure temporary password, creates an expiring 48-hour password reset link, establishes foreign key relations, computes 30-day Free Trial dates, enforces Indian phone/GSTIN/PAN formatting, and dispatches a welcome email with both the temporary password and direct password reset link.",
  item: [
    {
      name: "Register New Hotel (Multipart Form-Data with S3 Logo Upload)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.hotel && res.data.hotel.id) {",
              "        pm.collectionVariables.set('hotelId', String(res.data.hotel.id));",
              "        console.log('✅ New hotelId set to: ' + res.data.hotel.id);",
              "    }",
              "    if (res.data && res.data.auth && res.data.auth.accessToken) {",
              "        pm.collectionVariables.set('accessToken', res.data.auth.accessToken);",
              "        console.log('✅ Switched active accessToken to newly registered Hotel Admin');",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: multipartHeaders(),
        body: {
          mode: "formdata",
          formdata: [
            { key: "name", value: "Grand Imperial Palace & Resort", type: "text", description: "Property name (Required)" },
            { key: "ownerName", value: "Devendra Singh Rathore", type: "text", description: "Owner full name (Required)" },
            { key: "ownerEmail", value: "owner" + Math.floor(Math.random() * 90000 + 10000) + "@imperialresort.com", type: "text", description: "Owner login email (Required)" },
            { key: "ownerPhone", value: "9829012345", type: "text", description: "10-digit Indian mobile (Required)" },
            { key: "address", value: "101 Heritage Drive, Civil Lines", type: "text", description: "Property address (Required)" },
            { key: "city", value: "Jaipur", type: "text", description: "City (Required)" },
            { key: "state", value: "Rajasthan", type: "text", description: "State (Required)" },
            { key: "country", value: "India", type: "text", description: "Country (Optional, Default: India)" },
            { key: "pincode", value: "302006", type: "text", description: "6-digit postal pincode (Required)" },
            { key: "gstNumber", value: "08AAAAA1234A1Z5", type: "text", description: "15-character GSTIN (Optional)" },
            { key: "panNumber", value: "ABCDE1234F", type: "text", description: "10-character PAN (Optional)" },
            { key: "totalRooms", value: "45", type: "text", description: "Number of inventory rooms (Optional)" },
            { key: "hotelType", value: "Heritage Palace & Resort", type: "text", description: "Property category (Optional)" },
            { key: "website", value: "https://www.grandimperialresort.com", type: "text", description: "Official website URL (Optional)" },
            { key: "upi_id", value: "imperialresort@upi", type: "text", description: "Custom UPI ID for direct payments (Optional, no hardcoded default)" },
            { key: "subscription_plan_id", value: "1", type: "text", description: "Subscription Plan ID (Optional)" },
            { key: "subscription_plan_active", value: "true", type: "text", description: "Trial / plan active flag (Optional)" },
            { key: "logo", type: "file", src: [], description: "Hotel Logo file uploaded directly to AWS S3 (Optional)" }
          ]
        },
        url: buildUrl("{{baseUrl}}/api/v1/hotel/register"),
        description: `### Register New Hotel (Multipart Form-Data & S3 Logo Upload)
Registers a new hotel property and creates a linked \`HOTEL_ADMIN\` user account in an atomic transaction.
- **Multipart/Form-Data:** Supports direct file upload for \`logo\` which is saved directly to AWS S3 storage, and the permanent image URL is saved to \`hotels.logo\`.
- **Clean Schema:** Deprecated keys (\`id_proof_document\`, \`business_proof_document\`, \`rejection_reason\`, \`default_gst_rate\`, \`default_cgst_rate\`, \`default_sgst_rate\`, \`gstin\`, \`tax_inclusive\`, \`bank_details\`) have been removed.
- **Custom UPI ID:** \`upi_id\` is optional with no hardcoded fallback value.

#### 🔐 Temporary Password & Reset Link Workflow
1. **Zero-Password Input:** The client does not supply a password during registration.
2. **Auto-Generated Temp Password:** The backend generates a cryptographically secure temporary password (e.g. \`Temp#a8f12b0e\`) and hashes it with Bcrypt.
3. **Password Reset Token:** A 48-hour secure \`PasswordResetToken\` is created in the database.
4. **Email Dispatch:** A welcome email is dispatched to the owner's email containing:
   - **Temporary Password** clearly displayed for immediate front desk / admin login.
   - **Reset Password Button & Link** so the owner can easily click to update/set their permanent password.
5. **Account State:** The user account is saved with \`must_change_password: true\`.

#### Request Fields
| Field | Type | Required | Description | Validation / Constraints |
| :--- | :--- | :--- | :--- | :--- |
| \`name\` | String | **Required** | Property name | Max 150 chars, auto-generates slug |
| \`ownerName\` | String | **Required** | Owner or General Manager full name | Max 150 chars |
| \`ownerEmail\` | String | **Required** | Owner login email | Valid email, receives temp password & reset link |
| \`ownerPhone\` | String | **Required** | Owner contact mobile | 10-digit Indian mobile starting with 6, 7, 8, or 9 |
| \`address\` | String | **Required** | Physical property address | Street / landmark |
| \`city\` | String | **Required** | City | Max 100 chars |
| \`state\` | String | **Required** | State / Province | Max 100 chars |
| \`pincode\` | String | **Required** | Postal pincode | Exactly 6 Indian digits |
| \`country\` | String | *Optional* | Country name | Default: \`"India"\` |
| \`gstNumber\` | String | *Optional* | GSTIN tax identifier | 15-character GSTIN regex format |
| \`panNumber\` | String | *Optional* | Permanent Account Number | 10-character PAN regex format |
| \`totalRooms\` | Integer | *Optional* | Number of inventory rooms | Non-negative integer (e.g. 45) |
| \`hotelType\` | String | *Optional* | Property category | E.g. \`"Boutique Hotel"\`, \`"Resort"\`, \`"Heritage"\` |
| \`website\` | String | *Optional* | Official hotel website | Valid URL format |
| \`upi_id\` | String | *Optional* | Custom UPI ID | Direct payment identifier |
| \`logo\` | File | *Optional* | Image file for brand logo | Uploaded directly to S3 |
| \`subscription_plan_id\` | Integer | *Optional* | Initial subscription plan ID | Positive integer ID |
| \`subscription_plan_active\` | Boolean | *Optional* | Trial / plan active flag | Default: \`true\` |`
      }
    },
    {
      name: "Register Hotel (JSON Payload Alias)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.hotel && res.data.hotel.id) {",
              "        pm.collectionVariables.set('hotelId', String(res.data.hotel.id));",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            name: "Seaside Haven Resort " + Math.floor(Math.random() * 1000),
            ownerName: "Pooja Hegde",
            ownerEmail: "pooja" + Math.floor(Math.random() * 90000 + 10000) + "@seasidehaven.com",
            ownerPhone: "9871122334",
            address: "Beach Road, Calangute",
            city: "North Goa",
            state: "Goa",
            pincode: "403516",
            upi_id: "seasidehaven@okaxis"
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/hotels/register"),
        description: `### Register Hotel (Plural Endpoint Alias & JSON Mode)
Tests route mounting under \`/api/v1/hotels/register\` (plural alias of \`/hotel/register\`).
- Uses the same Temporary Password & Password Reset Link workflow.`
      }
    }
  ]
};

// =========================================================================
// 4. SUBSCRIPTION PLANS FOLDER
// =========================================================================
const planFolder = {
  name: "4. Subscription Plans",
  description: "Subscription tier catalog, pricing configuration, and feature synchronization. Public endpoints for hotel onboarding query; Super Admin endpoints for plan creation, feature sync, soft-deletion, and factory default resets.",
  item: [
    {
      name: "List Subscription Plans (Public)",
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/subscription-plans?billingCycle=MONTHLY&isActive=true&page=1&limit=10", [
          { key: "billingCycle", value: "MONTHLY", description: "Filter by MONTHLY or ANNUAL. If omitted, returns all plans." },
          { key: "isActive", value: "true", description: "Filter active plans (true/false)" },
          { key: "isPopular", value: "true", description: "Filter popular plans (true/false)", disabled: true },
          { key: "page", value: "1", description: "Page number (min 1)" },
          { key: "limit", value: "10", description: "Results per page (1-100)" }
        ]),
        description: `### List All Subscription Plans
Retrieves active subscription plans with full feature lists.
- **Access:** Public (No authentication required)
- **Response Structure:** Returns \`{ plans: [...], pagination: { ... } }\` (grouped keys \`all\`, \`monthly\`, \`annual\` have been removed).
- **Billing Cycle Filter:**
  - If omitted: returns **all** plans.
  - If \`billingCycle=MONTHLY\`: returns **monthly** plans only.
  - If \`billingCycle=ANNUAL\`: returns **annual** plans only.

#### Query Filters
| Query Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`billingCycle\` | String | *Optional* | Filter by \`"MONTHLY"\` or \`"ANNUAL"\` (returns all if omitted) |
| \`isActive\` | Boolean | *Optional* | \`true\` or \`false\` |
| \`isPopular\` | Boolean | *Optional* | \`true\` or \`false\` |
| \`page\` | Integer | *Optional* | Page index (default: 1) |
| \`limit\` | Integer | *Optional* | Page size (default: 10, max: 100) |`
      }
    },
    {
      name: "Get Subscription Plan by ID",
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/subscription-plans/:id", [], [
          { key: "id", value: "{{planId}}", description: "Subscription Plan ID" }
        ]),
        description: `### Get Subscription Plan by ID
Retrieves details of a single subscription plan including its ordered feature items.
- **Access:** Public`
      }
    },
    {
      name: "Create Subscription Plan (Super Admin)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.id) {",
              "        pm.collectionVariables.set('planId', String(res.data.id));",
              "        console.log('✅ Created planId set to: ' + res.data.id);",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            name: "Royal Heritage Ultra " + Math.floor(Math.random() * 1000),
            billingCycle: "MONTHLY",
            price: 18999,
            code: "MONTHLY_ROYAL_" + Math.floor(Math.random() * 1000),
            discountPercent: 10,
            maxRooms: 120,
            description: "Curated for premium luxury heritage palaces with 100+ suites.",
            badge: "ULTRA LUXURY",
            isPopular: true,
            isActive: true,
            displayOrder: 5,
            features: [
              "Up to 120 Luxury Rooms Inventory",
              "Multi-Channel OTA Two-Way Sync",
              "Front Desk & Express Walk-in Wizard",
              "Govt ID Compliance & Police Verification Ledger",
              "GST Tax Invoice & Receipt Generator",
              "Dedicated 24/7 Priority Relationship Manager"
            ]
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/subscription-plans"),
        description: `### Create Subscription Plan
Creates a new subscription plan with synchronized feature bullet points.
- **Access:** Protected (Requires \`SUPER_ADMIN\` role)

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`name\` | String | **Required** | Plan title (max 150 chars) |
| \`billingCycle\` | String | **Required** | Must be either \`"MONTHLY"\` or \`"ANNUAL"\` |
| \`price\` | Number | **Required** | Plan fee in INR (min 0) |
| \`code\` | String | *Optional* | Unique identifier (uppercase alphanumeric, hyphens, underscores) |
| \`discountPercent\` | Number | *Optional* | Discount percentage (0 - 100) |
| \`maxRooms\` | Integer | *Optional* | Room limit ceiling (positive integer) |
| \`description\` | String | *Optional* | Commercial description text |
| \`badge\` | String | *Optional* | Display badge (e.g. \`"BEST VALUE"\`, max 100 chars) |
| \`isPopular\` | Boolean | *Optional* | Popular highlight flag (default: false) |
| \`isActive\` | Boolean | *Optional* | Active availability flag (default: true) |
| \`displayOrder\` | Integer | *Optional* | Sorting position index (min 0) |
| \`features\` | Array/String| *Optional* | Array of feature string bullet points |`
      }
    },
    {
      name: "Update Subscription Plan (Super Admin)",
      request: {
        method: "PUT",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            price: 19999,
            discountPercent: 15,
            badge: "TOP PICK 2026",
            features: [
              "Up to 150 Luxury Rooms Inventory",
              "Multi-Channel OTA Two-Way Sync",
              "Full POS & Restaurant Matrix",
              "24/7 Dedicated Account Manager"
            ]
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/subscription-plans/:id", [], [
          { key: "id", value: "{{planId}}", description: "Plan ID to update" }
        ]),
        description: `### Update Subscription Plan
Modifies an existing plan and replaces its feature bullet points atomically.
- **Access:** Protected (\`SUPER_ADMIN\`)`
      }
    },
    {
      name: "Soft-Delete Subscription Plan (Super Admin)",
      request: {
        method: "DELETE",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/subscription-plans/:id", [], [
          { key: "id", value: "{{planId}}", description: "Plan ID to soft-delete" }
        ]),
        description: `### Soft-Delete Subscription Plan
Archives plan by setting \`deleted_at\`. Excluded from future queries.
- **Access:** Protected (\`SUPER_ADMIN\`)`
      }
    },
    {
      name: "Reset Default Enterprise Plans (Super Admin)",
      request: {
        method: "POST",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/subscription-plans/reset-defaults"),
        description: `### Reset Standard 6 Enterprise Plans
Restores the default suite of 6 subscription plans:
1. Starter Boutique (Monthly)
2. Professional Resort (Monthly)
3. Enterprise Multi-Property (Monthly)
4. Starter Boutique (Annual)
5. Professional Resort (Annual)
6. Enterprise Multi-Property (Annual)
- **Access:** Protected (\`SUPER_ADMIN\`)`
      }
    }
  ]
};

// =========================================================================
// 5. ROOM TYPES FOLDER
// =========================================================================
const roomTypeFolder = {
  name: "5. Room Types (Categories)",
  description: "Room Category (Room Type) management. Supports hotel-scoped category creation, S3 image uploads, name uniqueness per hotel, and safe-deletion constraints that prevent category removal if physical rooms are linked.",
  item: [
    {
      name: "List Room Categories",
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/room-types?hotel_id={{hotelId}}", [
          { key: "hotel_id", value: "{{hotelId}}", description: "Filter categories by Hotel ID" }
        ]),
        description: `### List Room Categories
Fetches all active room types / categories, optionally filtered by hotel ID.

#### Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`hotel_id\` | Integer | *Optional* | Filter categories belonging to a specific hotel |`
      }
    },
    {
      name: "Get Room Category by ID",
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/room-types/:id", [], [
          { key: "id", value: "{{roomTypeId}}", description: "Room Category ID" }
        ]),
        description: `### Get Room Category by ID
Retrieves details of a single room category along with all associated S3 photo records.`
      }
    },
    {
      name: "Create Room Category (JSON Mode)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.id) {",
              "        pm.collectionVariables.set('roomTypeId', String(res.data.id));",
              "        console.log('✅ Created roomTypeId set to: ' + res.data.id);",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            hotel_id: 1,
            name: "Presidential Royal Suite " + Math.floor(Math.random() * 1000),
            description: "Opulent 1,200 sq ft suite featuring master king bedroom, private terrace, dining area, jacuzzi, and dedicated butler service."
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/room-types"),
        description: `### Create Room Category (JSON Body)
Creates a room category using JSON.

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`hotel_id\` | Integer | **Required** | Valid hotel ID where category belongs |
| \`name\` | String | **Required** | Category name (unique within hotel, max 150 chars) |
| \`description\` | String | *Optional* | Detailed textual category description |`
      }
    },
    {
      name: "Create Room Category (Multipart Form-Data with Images)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.id) {",
              "        pm.collectionVariables.set('roomTypeId', String(res.data.id));",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        header: multipartHeaders(),
        body: {
          mode: "formdata",
          formdata: [
            { key: "hotel_id", value: "{{hotelId}}", type: "text", description: "Hotel ID (Required)" },
            { key: "name", value: "Executive Lakeview Suite " + Math.floor(Math.random() * 1000), type: "text", description: "Category Name (Required)" },
            { key: "description", value: "Spacious corner room with lake view and king size bed.", type: "text", description: "Category description (Optional)" },
            { key: "images", type: "file", src: [], description: "Image file upload (JPEG, PNG, WebP up to 10MB, Optional)" }
          ]
        },
        url: buildUrl("{{baseUrl}}/api/v1/room-types"),
        description: `### Create Room Category with Image Uploads (Multipart Form-Data)
Uploads up to 10 photos directly to AWS S3 storage while saving category record in MySQL.`
      }
    },
    {
      name: "Update Room Category",
      request: {
        method: "PUT",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            name: "Updated Executive Lakeview Suite",
            description: "Updated description with upgraded interior furnishings and espresso machine."
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/room-types/:id", [], [
          { key: "id", value: "{{roomTypeId}}", description: "Category ID" }
        ]),
        description: `### Update Room Category
Modifies room category details.`
      }
    },
    {
      name: "Delete Room Category",
      request: {
        method: "DELETE",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/room-types/:id", [], [
          { key: "id", value: "{{roomTypeId}}", description: "Category ID" }
        ]),
        description: `### Delete Room Category (Safe Guarded)
Safely deletes a category.
- **Data Integrity Guard:** Will return \`400 Bad Request\` if any physical rooms in the hotel are currently assigned to this category.`
      }
    }
  ]
};

// =========================================================================
// 6. PHYSICAL ROOMS FOLDER
// =========================================================================
const roomFolder = {
  name: "6. Physical Rooms",
  description: "Inventory of physical rooms (e.g. Room 101, 102, 201). Enforces composite floor uniqueness (room number unique per hotel and floor), room status workflows (AVAILABLE, RESERVED, OCCUPIED, CLEANING, MAINTENANCE, BLOCKED), and S3 photo galleries.",
  item: [
    {
      name: "Create Physical Room (Full Payload)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.id) {",
              "        pm.collectionVariables.set('roomId', String(res.data.id));",
              "        console.log('✅ Created roomId set to: ' + res.data.id);",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        header: multipartHeaders(),
        body: {
          mode: "formdata",
          formdata: [
            { key: "hotel_id", value: "{{hotelId}}", type: "text", description: "Hotel property ID (Required)" },
            { key: "room_number", value: "Suite-" + Math.floor(Math.random() * 800 + 100), type: "text", description: "Room identifier (Required, unique per hotel + floor)" },
            { key: "room_type_id", value: "{{roomTypeId}}", type: "text", description: "Category ID (Required)" },
            { key: "floor", value: "2", type: "text", description: "Floor number (Optional, default: 1)" },
            { key: "status", value: "AVAILABLE", type: "text", description: "Status: AVAILABLE, RESERVED, OCCUPIED, CLEANING, MAINTENANCE, BLOCKED (Optional, default: AVAILABLE)" },
            { key: "seating_capacity", value: "3", type: "text", description: "Max guest capacity (Optional, default: 2)" },
            { key: "bed_count", value: "1", type: "text", description: "Number of beds (Optional, default: 1)" },
            { key: "bed_type", value: "1 Super King Bed", type: "text", description: "Bed description (Optional)" },
            { key: "custom_price_per_night", value: "4500.00", type: "text", description: "Custom price per night in INR (Optional)" },
            { key: "notes", value: "Spacious corner room with private balcony and valley view.", type: "text", description: "Internal staff notes (Optional)" },
            { key: "amenities", value: "High-Speed Wi-Fi, Smart TV 55 inch, Mini Bar, Air Conditioning", type: "text", description: "List of amenities (Optional)" },
            { key: "cleaning_duration_minutes", value: "20", type: "text", description: "Turnaround duration min (Optional, default: 15)" },
            { key: "is_active", value: "true", type: "text", description: "Active availability flag (Optional, default: true)" },
            { key: "images", type: "file", src: [], description: "Room photo uploads directly stored in S3 (Optional)" }
          ]
        },
        url: buildUrl("{{baseUrl}}/api/v1/rooms"),
        description: `### Create Physical Room (Multipart Form-Data)
Creates a physical inventory room in the hotel and uploads room photos directly to AWS S3.

#### Request Fields
| Field | Type | Required | Description | Defaults & Rules |
| :--- | :--- | :--- | :--- | :--- |
| \`hotel_id\` | Integer | **Required** | Hotel property ID | Positive integer |
| \`room_number\` | String | **Required** | Room identifier (e.g. \`"101"\`, \`"201B"\`) | Max 50 chars, unique per hotel + floor |
| \`room_type_id\` | Integer | **Required** | Category ID | Must belong to specified hotel |
| \`floor\` | Integer | *Optional* | Floor number | Default: \`1\` |
| \`status\` | String | *Optional* | Current status | One of: \`AVAILABLE\`, \`RESERVED\`, \`OCCUPIED\`, \`CLEANING\`, \`MAINTENANCE\`, \`BLOCKED\` (Default: \`AVAILABLE\`) |
| \`seating_capacity\`| Integer | *Optional* | Max guest capacity | Min 1 (Default: \`2\`) |
| \`bed_count\` | Integer | *Optional* | Number of beds | Min 1 (Default: \`1\`) |
| \`bed_type\` | String | *Optional* | Bed description | Default: \`"1 King Bed"\` |
| \`custom_price_per_night\` | Number | *Optional* | Custom price per night in INR | Positive number (e.g. 4500.00) |
| \`notes\` | String | *Optional* | Internal staff notes | Any text |
| \`amenities\` | String | *Optional* | List of amenities | Comma-separated or JSON array |
| \`cleaning_duration_minutes\` | Integer | *Optional* | Housekeeping turnaround min | Default: \`15\` |
| \`is_active\` | Boolean | *Optional* | Active availability flag | Default: \`true\` |
| \`images\` | File | *Optional* | Room photos | Uploaded directly to AWS S3 |`
      }
    },
    {
      name: "List Physical Rooms (Filters & Pagination)",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/rooms?hotel_id={{hotelId}}&status=AVAILABLE&floor=2&page=1&limit=10", [
          { key: "hotel_id", value: "{{hotelId}}", description: "Filter by Hotel ID" },
          { key: "status", value: "AVAILABLE", description: "Filter by status (AVAILABLE, OCCUPIED, etc.)" },
          { key: "floor", value: "2", description: "Filter by floor number", disabled: true },
          { key: "room_type_id", value: "{{roomTypeId}}", description: "Filter by room category ID", disabled: true },
          { key: "is_active", value: "true", description: "Filter active rooms (true/false)", disabled: true },
          { key: "search", value: "Suite", description: "Search room number or notes", disabled: true },
          { key: "page", value: "1", description: "Page number" },
          { key: "limit", value: "10", description: "Page limit (1-100)" }
        ]),
        description: `### List Physical Rooms
Queries rooms with multi-criteria filtering, search, and pagination.

#### Query Filters
| Query Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`hotel_id\` | Integer | *Optional* | Filter by hotel ID |
| \`floor\` | Integer | *Optional* | Filter by floor |
| \`room_type_id\` | Integer | *Optional* | Filter by category ID |
| \`status\` | String | *Optional* | Status: \`AVAILABLE\`, \`RESERVED\`, \`OCCUPIED\`, \`CLEANING\`, \`MAINTENANCE\`, \`BLOCKED\` |
| \`is_active\` | Boolean | *Optional* | \`true\` or \`false\` |
| \`search\` | String | *Optional* | Substring match on room number or notes |
| \`page\` | Integer | *Optional* | Page index (default: 1) |
| \`limit\` | Integer | *Optional* | Results limit (default: 10, max: 100) |`
      }
    },
    {
      name: "Get Physical Room by ID",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/rooms/:id", [], [
          { key: "id", value: "{{roomId}}", description: "Room ID" }
        ]),
        description: `### Get Physical Room by ID
Retrieves room specifications, current status, category details, and photos.`
      }
    },
    {
      name: "Update Physical Room",
      request: {
        method: "PUT",
        header: multipartHeaders(),
        body: {
          mode: "formdata",
          formdata: [
            { key: "status", value: "MAINTENANCE", type: "text", description: "Room status update (Optional)" },
            { key: "notes", value: "AC maintenance scheduled with technician.", type: "text", description: "Room notes (Optional)" },
            { key: "custom_price_per_night", value: "4800.00", type: "text", description: "Custom nightly rate in INR (Optional)" },
            { key: "images", type: "file", src: [], description: "Additional room photos uploaded to S3 (Optional)" }
          ]
        },
        url: buildUrl("{{baseUrl}}/api/v1/rooms/:id", [], [
          { key: "id", value: "{{roomId}}", description: "Room ID to update" }
        ]),
        description: `### Update Physical Room (Multipart Form-Data)
Updates room attributes (e.g. status transition from AVAILABLE to OCCUPIED or MAINTENANCE) and supports attaching additional photos to S3.`
      }
    },
    {
      name: "Soft-Delete Physical Room",
      request: {
        method: "DELETE",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/rooms/:id", [], [
          { key: "id", value: "{{roomId}}", description: "Room ID to delete" }
        ]),
        description: `### Soft-Delete Physical Room
Soft-deletes physical room by populating \`deleted_at\`. Preserves booking history.`
      }
    }
  ]
};

// =========================================================================
// 7. BOOKINGS FOLDER
// =========================================================================
const bookingFolder = {
  name: "7. Bookings Management",
  description: "Complete reservation lifecycle management. Features automatic chronological date validation, room availability & overlap conflict prevention (409 Conflict), automated financial & GST tax computation (CGST, SGST, taxable base, discounts), payment status derivation (PENDING, PARTIALLY_PAID, PAID), and S3 guest ID & signature captures.",
  item: [
    {
      name: "Create New Booking (Full Payload)",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.id) {",
              "        pm.collectionVariables.set('bookingId', String(res.data.id));",
              "        console.log('✅ Created bookingId set to: ' + res.data.id);",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        header: multipartHeaders(),
        body: {
          mode: "formdata",
          formdata: [
            { key: "hotel_id", value: "{{hotelId}}", type: "text", description: "Hotel ID (Optional, defaults to authenticated user's hotel)" },
            { key: "room_id", value: "{{roomId}}", type: "text", description: "Physical room ID to reserve (Required)" },
            { key: "primary_guest_name", value: "Aaditya Vikramaditya", type: "text", description: "Primary guest full name (Required)" },
            { key: "secondary_guest_name", value: "Sneha Vikramaditya", type: "text", description: "Accompanying guest name (Optional)" },
            { key: "mobile_number", value: "+919876543210", type: "text", description: "Guest contact mobile (Required)" },
            { key: "address", value: "42 Park Avenue, South Extension Part 2, New Delhi", type: "text", description: "Guest residential address (Optional)" },
            { key: "check_in_date", value: "2026-11-01T14:00:00.000Z", type: "text", description: "Scheduled arrival timestamp (Required)" },
            { key: "check_out_date", value: "2026-11-04T11:00:00.000Z", type: "text", description: "Scheduled departure timestamp (Required)" },
            { key: "adults", value: "2", type: "text", description: "Number of adults (Optional, default: 1)" },
            { key: "children", value: "1", type: "text", description: "Number of children (Optional, default: 0)" },
            { key: "base_amount", value: "10500.00", type: "text", description: "Base charge before discount & taxes (Optional)" },
            { key: "discount_amount", value: "500.00", type: "text", description: "Discount deduction (Optional, default: 0)" },
            { key: "extra_charges_total", value: "200.00", type: "text", description: "Extra incidentals total (Optional, default: 0)" },
            { key: "gst_rate", value: "18.00", type: "text", description: "GST percentage rate (Optional, default: 18.00)" },
            { key: "paid_amount", value: "5000.00", type: "text", description: "Advance payment paid at desk (Optional, default: 0)" },
            { key: "notes", value: "Early check-in requested; anniversary celebration complimentary cake.", type: "text", description: "Special requests or front desk remarks (Optional)" },
            { key: "images", type: "file", src: [], description: "Guest Government ID proof document photo uploaded directly to S3 (Optional)" },
            { key: "signatures", type: "file", src: [], description: "Guest digital signature image uploaded directly to S3 with is_signature=true (Optional)" }
          ]
        },
        url: buildUrl("{{baseUrl}}/api/v1/bookings"),
        description: `### Create New Booking (Multipart Form-Data)
Creates a reservation with overlap validation, automated tax/payment computation, and S3 ID photo & signature uploads.

#### Automated Calculations Done by Server
- **Nights:** Calculated from \`check_in_date\` and \`check_out_date\`.
- **Taxable Amount:** \`(base_amount - discount_amount) + extra_charges_total + late_checkout_charge\`.
- **GST Taxes:** CGST = \`gst_rate / 2\` (9%), SGST = \`gst_rate / 2\` (9%).
- **Total Amount:** \`taxable_amount + gst_amount\`.
- **Due Amount:** \`total_amount - paid_amount\`.
- **Payment Status:** Auto-derived as \`PAID\`, \`PARTIALLY_PAID\`, or \`PENDING\`.
- **Overlap Prevention:** Checks if room is booked during overlapping dates; returns \`409 Conflict\` if conflict detected.

#### Request Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`primary_guest_name\` | String | **Required** | Primary guest full name (2 - 255 chars) |
| \`mobile_number\` | String | **Required** | Primary guest contact phone (7 - 20 chars) |
| \`room_id\` | Integer | **Required** | Physical room ID to reserve |
| \`check_in_date\` | ISO Date | **Required** | Scheduled arrival timestamp |
| \`check_out_date\` | ISO Date | **Required** | Scheduled departure timestamp (must be > check-in) |
| \`hotel_id\` | Integer | *Optional* | Hotel ID (auto-scoped from auth user if omitted) |
| \`secondary_guest_name\`| String | *Optional* | Name of accompanying guest |
| \`address\` | String | *Optional* | Guest address |
| \`adults\` | Integer | *Optional* | Number of adults (min 1, default: 1) |
| \`children\` | Integer | *Optional* | Number of children (min 0, default: 0) |
| \`base_amount\` | Number | *Optional* | Base charge (auto-calculated from room rate if omitted) |
| \`discount_amount\` | Number | *Optional* | Discount deducted before tax (default: 0) |
| \`extra_charges_total\`| Number | *Optional* | Incidental / extra services total (default: 0) |
| \`late_checkout_charge\`| Number | *Optional* | Late departure surcharge (default: 0) |
| \`late_checkout_hours\` | Number | *Optional* | Late checkout hours approved (default: 0) |
| \`gst_rate\` | Number | *Optional* | GST percentage (default: 18.00) |
| \`paid_amount\` | Number | *Optional* | Advance payment made (default: 0) |
| \`booking_status\` | String | *Optional* | Stay status. Defaults to \`CHECKED_IN\`. Also \`PENDING\`, \`CONFIRMED\`, \`CHECKED_OUT\`, \`CANCELLED\`, \`NO_SHOW\` |
| \`notes\` | String | *Optional* | Special requests or front desk remarks |
| \`images\` | File | *Optional* | Guest ID document photo uploaded directly to S3 |
| \`signatures\` | File | *Optional* | Digital signature image uploaded directly to S3 |`
      }
    },
    {
      name: "List Bookings (Filters & Search)",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/bookings?hotel_id={{hotelId}}&payment_status=PARTIALLY_PAID&page=1&limit=10", [
          { key: "hotel_id", value: "{{hotelId}}", description: "Filter by Hotel ID" },
          { key: "payment_status", value: "PARTIALLY_PAID", description: "Filter by payment status: PENDING, PARTIALLY_PAID, PAID" },
          { key: "booking_status", value: "CONFIRMED", description: "Filter by stay status: PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, NO_SHOW", disabled: true },
          { key: "room_id", value: "{{roomId}}", description: "Filter by Room ID", disabled: true },
          { key: "booking_number", value: "BK-", description: "Filter by booking code (e.g. BK-17918-999)", disabled: true },
          { key: "primary_guest_name", value: "Aaditya", description: "Filter by primary guest name", disabled: true },
          { key: "mobile_number", value: "9876543210", description: "Filter by guest mobile number", disabled: true },
          { key: "search", value: "Aaditya", description: "Search guest name or booking number", disabled: true },
          { key: "page", value: "1", description: "Page number" },
          { key: "limit", value: "10", description: "Page limit (1-100)" }
        ]),
        description: `### List Bookings
Retrieves paginated bookings with flexible filtering and search criteria.

#### Query Filters
| Query Param | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| \`hotel_id\` | Integer | *Optional* | Hotel property ID |
| \`room_id\` | Integer | *Optional* | Assigned room ID |
| \`booking_number\` | String | *Optional* | Exact booking reference code |
| \`primary_guest_name\` | String | *Optional* | Guest name |
| \`payment_status\` | String | *Optional* | \`PENDING\`, \`PARTIALLY_PAID\`, or \`PAID\` |
| \`booking_status\` | String | *Optional* | \`PENDING\`, \`CONFIRMED\`, \`CHECKED_IN\`, \`CHECKED_OUT\`, \`CANCELLED\`, or \`NO_SHOW\` |
| \`check_in_from\` | ISO Date | *Optional* | Start date of check-in window |
| \`check_in_to\` | ISO Date | *Optional* | End date of check-in window |
| \`check_out_from\` | ISO Date | *Optional* | Start date of check-out window |
| \`check_out_to\` | ISO Date | *Optional* | End date of check-out window |
| \`search\` | String | *Optional* | Search query across guest name or booking number |
| \`page\` | Integer | *Optional* | Page number (default: 1) |
| \`limit\` | Integer | *Optional* | Results per page (default: 10, max: 100) |`
      }
    },
    {
      name: "Get Booking Details by ID",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/bookings/:id", [], [
          { key: "id", value: "{{bookingId}}", description: "Booking ID" }
        ]),
        description: `### Get Booking by ID
Returns complete booking record joined with hotel property information, assigned room number, financial breakdown, tax amounts, guest ID photos, and signature records.`
      }
    },
    {
      name: "Update Booking (Dates, Financials, Status)",
      request: {
        method: "PUT",
        header: multipartHeaders(),
        body: {
          mode: "formdata",
          formdata: [
            { key: "paid_amount", value: "12036.00", type: "text", description: "Updated paid amount (recalculates due balance to 0 and transitions status to PAID)" },
            { key: "notes", value: "Payment cleared in full via UPI at front desk.", type: "text", description: "Updated front desk notes (Optional)" },
            { key: "actual_check_in", value: "2026-11-01T14:15:00.000Z", type: "text", description: "Actual check-in time recorded at front desk (Optional)" },
            { key: "images", type: "file", src: [], description: "Additional guest ID photo uploaded to S3 (Optional)" },
            { key: "signatures", type: "file", src: [], description: "Updated digital signature image uploaded to S3 (Optional)" }
          ]
        },
        url: buildUrl("{{baseUrl}}/api/v1/bookings/:id", [], [
          { key: "id", value: "{{bookingId}}", description: "Booking ID to update" }
        ]),
        description: `### Update Booking (Multipart Form-Data)
Updates booking fields and automatically recalculates tax balances.
- Supports uploading additional ID proof photos or signature files to AWS S3.
- If \`paid_amount\` is increased to meet total balance, \`payment_status\` transitions to \`PAID\`.
- If dates or room are updated, validates that new dates do not collide with another booking.`
      }
    },
    {
      name: "Update Booking Status",
      request: {
        method: "PATCH",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            booking_status: "CHECKED_IN"
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/bookings/:id/status", [], [
          { key: "id", value: "{{bookingId}}", description: "Booking ID" }
        ]),
        description: `### Update Booking Stay Status
Updates only \`booking_status\`. Allowed values: \`PENDING\`, \`CONFIRMED\`, \`CHECKED_IN\`, \`CHECKED_OUT\`, \`CANCELLED\`, \`NO_SHOW\`.

- \`CONFIRMED\` marks an available room \`RESERVED\`.
- \`CHECKED_IN\` records \`actual_check_in\` and marks the room \`OCCUPIED\`.
- \`CHECKED_OUT\` records \`actual_check_out\` and marks the room \`CLEANING\`.
- \`CANCELLED\` and \`NO_SHOW\` release the room and no longer block those dates.
- \`payment_status\` and billed amounts are left unchanged. Checkout settlement still uses \`POST /bookings/:id/check-out\`.`
      }
    },
    {
      name: "Soft-Delete Booking (Releases Room)",
      request: {
        method: "DELETE",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/bookings/:id", [], [
          { key: "id", value: "{{bookingId}}", description: "Booking ID to delete" }
        ]),
        description: `### Soft-Delete Booking
Marks booking as deleted by setting \`deleted_at\`.
- Immediately frees the room so the dates can be booked by new guests.`
      }
    }
  ]
};

// =========================================================================
// 8. USERS FOLDER
// =========================================================================
const userFolder = {
  name: "8. User & Staff Management",
  description: "Internal staff governance and role-based access control. Hotel Admins can manage their property's staff accounts (RECEPTIONIST, MANAGER, HOUSEKEEPING, ACCOUNTANT). Super Admins have universal platform access. Includes password hashing with Bcrypt, hotel isolation, and self-deletion protection.",
  item: [
    {
      name: "Create Staff Member",
      event: [
        {
          listen: "test",
          script: {
            exec: [
              "if (pm.response.code === 201) {",
              "    var res = pm.response.json();",
              "    if (res.data && res.data.id) {",
              "        pm.collectionVariables.set('userId', String(res.data.id));",
              "        console.log('✅ Created userId set to: ' + res.data.id);",
              "    }",
              "}"
            ],
            type: "text/javascript"
          }
        }
      ],
      request: {
        method: "POST",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            name: "Rohit Deshmukh",
            email: "rohit" + Math.floor(Math.random() * 90000 + 10000) + "@frontdesk.com",
            password: "StaffPassword@123",
            phone: "+919876543210",
            role: "RECEPTIONIST",
            hotel_id: 1,
            is_active: true,
            must_change_password: true
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/users"),
        description: `### Create Staff User
Creates a staff user account.
- **Access:** Protected (Requires \`HOTEL_ADMIN\` or \`SUPER_ADMIN\`)
- **Hotel Admin Restriction:** Hotel Admins can create staff roles (\`RECEPTIONIST\`, \`MANAGER\`, \`HOUSEKEEPING\`, \`ACCOUNTANT\`) for their own hotel only.
- **Temporary Password & Setup Link Flow:** If \`password\` is omitted, the system generates a secure temporary password (e.g. \`Temp#a8f12b0e\`).
- **Welcome Email:** Dispatches an onboarding email to the staff user containing both their initial login password and an expiring 48-hour password reset link so they can easily set/reset their permanent password.

#### Request Fields
| Field | Type | Required | Description | Validation |
| :--- | :--- | :--- | :--- | :--- |
| \`name\` | String | **Required** | Staff full name | 2 - 100 chars |
| \`email\` | String | **Required** | Unique login email | Valid email format |
| \`phone\` | String | **Required** | Contact mobile | 5 - 20 chars |
| \`role\` | String | **Required** | Role code | One of: \`HOTEL_ADMIN\`, \`RECEPTIONIST\`, \`MANAGER\`, \`HOUSEKEEPING\`, \`ACCOUNTANT\` |
| \`password\` | String | *Optional* | Initial login password (auto-generated if omitted) | Min 6 chars (hashed with bcrypt) |
| \`hotel_id\` | Integer | *Optional* | Hotel ID | Hotel Admin automatically forced to their own hotel |
| \`is_active\` | Boolean | *Optional* | Active status | Default: \`true\` |
| \`must_change_password\` | Boolean | *Optional* | Require password change on first login | Default: \`true\` when auto-generated |`
      }
    },
    {
      name: "List Staff Members (Filter, Sort, Search)",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/users?role=RECEPTIONIST&is_active=true&sort_by=created_at&sort_order=desc&page=1&limit=10", [
          { key: "role", value: "RECEPTIONIST", description: "Filter by role code" },
          { key: "is_active", value: "true", description: "Filter by active status (true/false)" },
          { key: "hotel_id", value: "{{hotelId}}", description: "Filter by Hotel ID", disabled: true },
          { key: "sort_by", value: "created_at", description: "Sort column: id, name, email, role, is_active, created_at, updated_at, last_login_at" },
          { key: "sort_order", value: "desc", description: "Sort order: asc or desc" },
          { key: "search", value: "Rohit", description: "Search query across name, email, or phone", disabled: true },
          { key: "page", value: "1", description: "Page number" },
          { key: "limit", value: "10", description: "Results per page (1-100)" }
        ]),
        description: `### List Staff Members
Returns paginated list of staff members with sorting and filtering.
- **Access:** Protected (\`HOTEL_ADMIN\` or \`SUPER_ADMIN\`)`
      }
    },
    {
      name: "Get Staff Member by ID",
      request: {
        method: "GET",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/users/:id", [], [
          { key: "id", value: "{{userId}}", description: "User ID" }
        ]),
        description: `### Get Staff Member by ID
Retrieves details of a staff user without exposing password hashes.`
      }
    },
    {
      name: "Update Staff Member Details",
      request: {
        method: "PUT",
        header: jsonHeaders(),
        body: {
          mode: "raw",
          raw: JSON.stringify({
            name: "Rohit Deshmukh (Senior Front Desk)",
            phone: "+919876543299",
            is_active: true
          }, null, 2)
        },
        url: buildUrl("{{baseUrl}}/api/v1/users/:id", [], [
          { key: "id", value: "{{userId}}", description: "User ID to update" }
        ]),
        description: `### Update Staff Member
Modifies staff attributes.
- **Access:** Protected (\`HOTEL_ADMIN\` or \`SUPER_ADMIN\`)`
      }
    },
    {
      name: "Soft-Delete Staff Member",
      request: {
        method: "DELETE",
        header: jsonHeaders(),
        url: buildUrl("{{baseUrl}}/api/v1/users/:id", [], [
          { key: "id", value: "{{userId}}", description: "User ID to delete" }
        ]),
        description: `### Soft-Delete Staff Member
Soft-deletes a user account by setting \`deleted_at\`.
- **Self-Deletion Guard:** Prevents an administrator from deleting their own account.`
      }
    }
  ]
};

// Assemble collection
collection.item = [
  healthFolder,
  authFolder,
  hotelFolder,
  planFolder,
  roomTypeFolder,
  roomFolder,
  bookingFolder,
  userFolder
];

const outputPath = path.join(__dirname, '..', 'postman_collection.json');
fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2), 'utf8');

console.log('🎉 Postman Collection generated successfully at: ' + outputPath);
console.log('Total folders: ' + collection.item.length);
let totalRequests = 0;
collection.item.forEach(f => {
  totalRequests += f.item.length;
  console.log(`  📂 ${f.name}: ${f.item.length} requests`);
});
console.log(`Total API Requests covered: ${totalRequests}`);
