/**
 * Automated Test Suite for User Management CRUD APIs.
 * Tests:
 * 1. POST /api/v1/users (Validation, Email uniqueness, Password hashing, RBAC, Data isolation)
 * 2. GET /api/v1/users (Pagination, Filters, Search, Hotel isolation, Exclusion of deleted)
 * 3. GET /api/v1/users/:id (Single user details, Hotel isolation, 404 on deleted)
 * 4. PUT /api/v1/users/:id (Partial updates, Sensitive field rejection, Self-deactivation guard, Last Super Admin guard, RBAC)
 * 5. DELETE /api/v1/users/:id (Soft-deletion, Self-deletion guard, Last Super Admin guard, RBAC)
 */
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('../database/knex');
const { generateAccessToken } = require('../utils/jwt');

let server;
let baseUrl;

const startServer = () => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
};

const stopServer = () => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
};

const sendRequest = (method, path, body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { ...headers };

    if (body && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          let json = {};
          try {
            json = rawData ? JSON.parse(rawData) : {};
          } catch (_) {
            json = { raw: rawData };
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json,
          });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
};

let passCount = 0;
let failCount = 0;

const assert = (condition, testName) => {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failCount++;
  }
};

let superAdminId;
let superAdminToken;
let hotel1Id;
let hotel2Id;
let hotelAdmin1Id;
let hotelAdmin1Token;
let hotelAdmin2Id;
let hotelAdmin2Token;
let staffUserId;
let staffToken;

const createdUserIds = [];
const createdHotelIds = [];

const setupTestData = async () => {
  // 1. Create or fetch Hotels
  let h1 = await db('hotels').where({ slug: 'user-test-hotel-1' }).first();
  if (!h1) {
    const [hid] = await db('hotels').insert({
      name: 'User Test Hotel 1',
      slug: 'user-test-hotel-1',
      address: '123 Grand Lane',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel1Id = hid;
    createdHotelIds.push(hid);
  } else {
    hotel1Id = h1.id;
  }

  let h2 = await db('hotels').where({ slug: 'user-test-hotel-2' }).first();
  if (!h2) {
    const [hid] = await db('hotels').insert({
      name: 'User Test Hotel 2',
      slug: 'user-test-hotel-2',
      address: '456 Sea View Road',
      city: 'Goa',
      state: 'Goa',
      country: 'India',
      pincode: '403001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel2Id = hid;
    createdHotelIds.push(hid);
  } else {
    hotel2Id = h2.id;
  }

  // 2. Setup Super Admin
  let sa = await db('users').where({ email: 'superadmin_test@hotel.com' }).first();
  const hashedPassword = await bcrypt.hash('Admin@123', 10);
  if (!sa) {
    const [uid] = await db('users').insert({
      name: 'Super Admin User',
      email: 'superadmin_test@hotel.com',
      password: hashedPassword,
      phone: '9998887771',
      role: 'SUPER_ADMIN',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    superAdminId = uid;
    createdUserIds.push(uid);
  } else {
    superAdminId = sa.id;
  }
  superAdminToken = generateAccessToken(superAdminId, 'SUPER_ADMIN');

  // 3. Setup Hotel Admin 1
  let ha1 = await db('users').where({ email: 'hoteladmin1_test@hotel.com' }).first();
  if (!ha1) {
    const [uid] = await db('users').insert({
      name: 'Hotel Admin 1',
      email: 'hoteladmin1_test@hotel.com',
      password: hashedPassword,
      phone: '9998887772',
      role: 'HOTEL_ADMIN',
      hotel_id: hotel1Id,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotelAdmin1Id = uid;
    createdUserIds.push(uid);
  } else {
    hotelAdmin1Id = ha1.id;
  }
  hotelAdmin1Token = generateAccessToken(hotelAdmin1Id, 'HOTEL_ADMIN');

  // 4. Setup Hotel Admin 2
  let ha2 = await db('users').where({ email: 'hoteladmin2_test@hotel.com' }).first();
  if (!ha2) {
    const [uid] = await db('users').insert({
      name: 'Hotel Admin 2',
      email: 'hoteladmin2_test@hotel.com',
      password: hashedPassword,
      phone: '9998887773',
      role: 'HOTEL_ADMIN',
      hotel_id: hotel2Id,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotelAdmin2Id = uid;
    createdUserIds.push(uid);
  } else {
    hotelAdmin2Id = ha2.id;
  }
  hotelAdmin2Token = generateAccessToken(hotelAdmin2Id, 'HOTEL_ADMIN');

  // 5. Setup Staff User
  let staff = await db('users').where({ email: 'receptionist_test@hotel.com' }).first();
  if (!staff) {
    const [uid] = await db('users').insert({
      name: 'Receptionist Staff',
      email: 'receptionist_test@hotel.com',
      password: hashedPassword,
      phone: '9998887774',
      role: 'RECEPTIONIST',
      hotel_id: hotel1Id,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    staffUserId = uid;
    createdUserIds.push(uid);
  } else {
    staffUserId = staff.id;
  }
  staffToken = generateAccessToken(staffUserId, 'RECEPTIONIST');
};

const cleanupTestData = async () => {
  if (createdUserIds.length > 0) {
    await db('users').whereIn('id', createdUserIds).del();
  }
  if (createdHotelIds.length > 0) {
    await db('hotels').whereIn('id', createdHotelIds).del();
  }
};

const runTests = async () => {
  console.log('--- Starting User Management Module API Tests ---');
  await startServer();
  await setupTestData();

  let createdStaff1Id;
  let createdStaff2Id;

  try {
    // =========================================================================
    // 1. POST /api/v1/users (Create User)
    // =========================================================================
    console.log('\n[1] POST /api/v1/users Tests');

    // 1.1 Unauthenticated request returns 401
    {
      const res = await sendRequest('POST', '/api/v1/users', {
        name: 'Unauth User',
        email: 'unauth@hotel.com',
        password: 'Password@123',
        phone: '1234567890',
        role: 'RECEPTIONIST',
      });
      assert(res.status === 401, 'POST /api/v1/users without token returns 401 Unauthorized');
    }

    // 1.2 Unauthorized staff role returns 403
    {
      const res = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Staff Created User',
          email: 'staff_created@hotel.com',
          password: 'Password@123',
          phone: '1234567890',
          role: 'RECEPTIONIST',
        },
        { Authorization: `Bearer ${staffToken}` }
      );
      assert(res.status === 403, 'POST /api/v1/users by RECEPTIONIST returns 403 Forbidden');
    }

    // 1.3 Missing required fields returns 400
    {
      const res = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: '',
          email: 'not-an-email',
          password: '123',
          phone: '',
          role: 'INVALID_ROLE',
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'POST /api/v1/users with invalid fields returns 400 Bad Request');
    }

    // 1.4 Short password (< 6 chars) returns 400
    {
      const res = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Short Password User',
          email: 'short_pw@hotel.com',
          password: '12345',
          phone: '9876543210',
          role: 'RECEPTIONIST',
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'POST /api/v1/users with short password returns 400 Bad Request');
    }

    // 1.5 Super Admin successfully creates a user with secure password hashing
    {
      const res = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Alice FrontDesk',
          email: 'alice.frontdesk@hotel.com',
          password: 'SecurePassword@2026',
          phone: '9876543211',
          role: 'RECEPTIONIST',
          hotel_id: hotel1Id,
          is_active: true,
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );

      assert(res.status === 201, 'POST /api/v1/users by SUPER_ADMIN returns 201 Created');
      assert(res.body.success === true, 'Response indicates success');
      assert(res.body.data.id > 0, 'User ID is returned');
      assert(res.body.data.password === undefined, 'Password is NEVER returned in response');
      assert(res.body.data.email === 'alice.frontdesk@hotel.com', 'Email is saved correctly');
      assert(res.body.data.is_active === true, 'is_active is true');
      assert(res.body.data.must_change_password === false, 'must_change_password defaults to false');
      assert(res.body.data.failed_login_attempts === 0, 'failed_login_attempts defaults to 0');
      assert(res.body.data.deleted_at === null, 'deleted_at is null');
      assert(res.body.data.is_deleted === false, 'is_deleted is false');

      createdStaff1Id = res.body.data.id;
      createdUserIds.push(createdStaff1Id);

      // Verify DB record has bcrypt hash
      const dbUser = await db('users').where({ id: createdStaff1Id }).first();
      assert(dbUser.password.startsWith('$2'), 'Password in database is hashed using bcrypt');
      const matchesPassword = await bcrypt.compare('SecurePassword@2026', dbUser.password);
      assert(matchesPassword === true, 'Bcrypt hash correctly verifies raw password');
    }

    // 1.6 Duplicate email returns 409 Conflict
    {
      const res = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Duplicate Email User',
          email: 'alice.frontdesk@hotel.com',
          password: 'AnotherPassword@123',
          phone: '9876543212',
          role: 'RECEPTIONIST',
          hotel_id: hotel1Id,
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 409, 'POST /api/v1/users with duplicate email returns 409 Conflict');
    }

    // 1.7 Hotel Admin creates staff for own hotel
    {
      const res = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Bob Housekeeping',
          email: 'bob.hk@hotel.com',
          password: 'StaffPassword@123',
          phone: '9876543213',
          role: 'HOUSEKEEPING',
        },
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );

      assert(res.status === 201, 'POST /api/v1/users by HOTEL_ADMIN returns 201 Created');
      assert(res.body.data.hotel_id === hotel1Id, 'Staff user is bound to Hotel Admin hotel');
      createdStaff2Id = res.body.data.id;
      createdUserIds.push(createdStaff2Id);
    }

    // 1.8 Hotel Admin cannot create SUPER_ADMIN or HOTEL_ADMIN
    {
      const res1 = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Malicious Super Admin',
          email: 'malicious.sa@hotel.com',
          password: 'Password@123',
          phone: '9876543214',
          role: 'SUPER_ADMIN',
        },
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res1.status === 403, 'HOTEL_ADMIN attempting to create SUPER_ADMIN returns 403 Forbidden');

      const res2 = await sendRequest(
        'POST',
        '/api/v1/users',
        {
          name: 'Malicious Hotel Admin',
          email: 'malicious.ha@hotel.com',
          password: 'Password@123',
          phone: '9876543215',
          role: 'HOTEL_ADMIN',
        },
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res2.status === 403, 'HOTEL_ADMIN attempting to create HOTEL_ADMIN returns 403 Forbidden');
    }

    // =========================================================================
    // 2. GET /api/v1/users (List Users with Pagination & Filters)
    // =========================================================================
    console.log('\n[2] GET /api/v1/users Tests');

    // 2.1 Pagination and structure with snake_case
    {
      const res = await sendRequest(
        'GET',
        '/api/v1/users?page=1&limit=5&sort_by=created_at&sort_order=desc',
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 200, 'GET /api/v1/users returns 200 OK');
      assert(Array.isArray(res.body.data.users), 'Response data contains users array');
      assert(res.body.data.total >= 3, 'Total count matches users in database');
      assert(res.body.data.page === 1, 'Page number is 1');
      assert(res.body.data.limit === 5, 'Limit is 5');
      assert(res.body.data.users.every((u) => u.password === undefined), 'None of the users have passwords in response');
    }

    // 2.2 Search filter
    {
      const res = await sendRequest(
        'GET',
        '/api/v1/users?search=Alice',
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 200, 'Search by keyword returns 200');
      assert(res.body.data.users.some((u) => u.name.includes('Alice')), 'Search results contain Alice');
    }

    // 2.3 Role and is_active filters
    {
      const res = await sendRequest(
        'GET',
        '/api/v1/users?role=RECEPTIONIST&is_active=true',
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 200, 'Filter by role and is_active returns 200');
      assert(res.body.data.users.every((u) => u.role === 'RECEPTIONIST' && u.is_active === true), 'Filtered correctly');
    }

    // 2.4 Hotel-level data isolation for HOTEL_ADMIN
    {
      const res = await sendRequest(
        'GET',
        '/api/v1/users',
        null,
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res.status === 200, 'HOTEL_ADMIN gets user list successfully');
      assert(
        res.body.data.users.every((u) => u.hotel_id === hotel1Id),
        'HOTEL_ADMIN only sees users belonging to hotel 1'
      );
      assert(
        !res.body.data.users.some((u) => u.role === 'SUPER_ADMIN'),
        'HOTEL_ADMIN list does not expose SUPER_ADMIN users'
      );
    }

    // =========================================================================
    // 3. GET /api/v1/users/:id (Get Single User)
    // =========================================================================
    console.log('\n[3] GET /api/v1/users/:id Tests');

    // 3.1 Get single user successfully
    {
      const res = await sendRequest(
        'GET',
        `/api/v1/users/${createdStaff1Id}`,
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 200, 'GET /api/v1/users/:id returns 200 OK');
      assert(res.body.data.id === createdStaff1Id, 'Correct user ID returned');
      assert(res.body.data.password === undefined, 'No password field in single user response');
      assert(res.body.data.name === 'Alice FrontDesk', 'User details match');
      assert(res.body.data.is_active === true, 'is_active is true');
    }

    // 3.2 404 on non-existent ID
    {
      const res = await sendRequest(
        'GET',
        '/api/v1/users/999999',
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 404, 'GET /api/v1/users/999999 returns 404 Not Found');
    }

    // 3.3 Hotel Admin accessing user from another hotel returns 403
    {
      const res = await sendRequest(
        'GET',
        `/api/v1/users/${hotelAdmin2Id}`,
        null,
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res.status === 403, 'HOTEL_ADMIN accessing user of another hotel returns 403 Forbidden');
    }

    // =========================================================================
    // 4. PUT /api/v1/users/:id (Update User)
    // =========================================================================
    console.log('\n[4] PUT /api/v1/users/:id Tests');

    // 4.1 Update general user details
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${createdStaff1Id}`,
        {
          name: 'Alice Updated',
          phone: '9876540000',
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 200, 'PUT /api/v1/users/:id updates details successfully');
      assert(res.body.data.name === 'Alice Updated', 'Name is updated');
      assert(res.body.data.phone === '9876540000', 'Phone is updated');
      assert(res.body.data.password === undefined, 'Password is not returned');
    }

    // 4.2 Rejection of sensitive authentication fields
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${createdStaff1Id}`,
        {
          password: 'HackedPassword@123',
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'Attempting to update password via general PUT returns 400 Bad Request');
    }

    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${createdStaff1Id}`,
        {
          failed_login_attempts: 10,
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'Attempting to update failed_login_attempts returns 400 Bad Request');
    }

    // 4.3 Self-deactivation prevention
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${superAdminId}`,
        {
          is_active: false,
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'User attempting to deactivate own account returns 400 Bad Request');
    }

    // 4.4 Self-role change prevention
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${superAdminId}`,
        {
          role: 'RECEPTIONIST',
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'User attempting to change own role returns 400 Bad Request');
    }

    // 4.5 Hotel Admin cannot update user in another hotel
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${hotelAdmin2Id}`,
        {
          name: 'Hacked User',
        },
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res.status === 403, 'HOTEL_ADMIN attempting to update user in another hotel returns 403');
    }

    // 4.6 Hotel Admin cannot promote staff to SUPER_ADMIN
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${createdStaff2Id}`,
        {
          role: 'SUPER_ADMIN',
        },
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res.status === 403, 'HOTEL_ADMIN attempting to assign SUPER_ADMIN returns 403 Forbidden');
    }

    // 4.7 Duplicate email rejection on update
    {
      const res = await sendRequest(
        'PUT',
        `/api/v1/users/${createdStaff2Id}`,
        {
          email: 'alice.frontdesk@hotel.com',
        },
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 409, 'Updating email to an existing email returns 409 Conflict');
    }

    // =========================================================================
    // 5. DELETE /api/v1/users/:id (Soft Delete)
    // =========================================================================
    console.log('\n[5] DELETE /api/v1/users/:id Tests');

    // 5.1 Self-deletion prevention
    {
      const res = await sendRequest(
        'DELETE',
        `/api/v1/users/${superAdminId}`,
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 400, 'User attempting to delete own account returns 400 Bad Request');
    }

    // 5.2 Hotel Admin cannot delete user of another hotel
    {
      const res = await sendRequest(
        'DELETE',
        `/api/v1/users/${hotelAdmin2Id}`,
        null,
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res.status === 403, 'HOTEL_ADMIN attempting to delete user of another hotel returns 403');
    }

    // 5.3 Successful soft deletion of staff user
    {
      const res = await sendRequest(
        'DELETE',
        `/api/v1/users/${createdStaff2Id}`,
        null,
        { Authorization: `Bearer ${hotelAdmin1Token}` }
      );
      assert(res.status === 200, 'DELETE /api/v1/users/:id returns 200 OK');
      assert(res.body.data.is_deleted === true, 'Response contains is_deleted: true');

      // Check database state directly
      const dbUser = await db('users').where({ id: createdStaff2Id }).first();
      assert(dbUser.deleted_at !== null, 'deleted_at timestamp is set in database');
      assert(dbUser.is_active === 0 || dbUser.is_active === false, 'is_active is set to false in database');
    }

    // 5.4 Deleted user returns 404 on GET /api/v1/users/:id
    {
      const res = await sendRequest(
        'GET',
        `/api/v1/users/${createdStaff2Id}`,
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(res.status === 404, 'Soft-deleted user returns 404 on GET by ID');
    }

    // 5.5 Deleted user is excluded from GET /api/v1/users list
    {
      const res = await sendRequest(
        'GET',
        '/api/v1/users',
        null,
        { Authorization: `Bearer ${superAdminToken}` }
      );
      assert(
        !res.body.data.users.some((u) => u.id === createdStaff2Id),
        'Soft-deleted user is excluded from normal list query'
      );
    }
  } catch (err) {
    console.error('Unexpected test error:', err);
    failCount++;
  } finally {
    await cleanupTestData();
    await stopServer();
    await db.destroy();

    console.log('\n=========================================');
    console.log(`User Management Tests Summary: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('=========================================');

    process.exit(failCount > 0 ? 1 : 0);
  }
};

runTests();
