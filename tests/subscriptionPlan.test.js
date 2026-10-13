/**
 * Automated Test Suite for Subscription Plans CRUD APIs.
 * Tests:
 * 1. Authentication & RBAC Guards (401 Unauthorized, 403 Forbidden)
 * 2. POST /api/v1/subscription-plans (Validation, Normalization, Uniqueness, 201 Created)
 * 3. GET /api/v1/subscription-plans (Public, Pagination, Filtering, Sorting)
 * 4. GET /api/v1/subscription-plans/:id (Single Plan, 404 Not Found, Invalid ID)
 * 5. PUT /api/v1/subscription-plans/:id (Partial Update, Feature Sync, 409 Duplicate Code)
 * 6. DELETE /api/v1/subscription-plans/:id (Soft Deletion, deletedAt timestamp, Excluded from Queries)
 * 7. Dual prefix alias testing (/api/v1/... and /api/...)
 */
process.env.NODE_ENV = 'test';
const http = require('http');
const app = require('../app');
const db = require('../database/knex');
const { generateAccessToken } = require('../utils/jwt');
const subscriptionPlanModel = require('../models/subscriptionPlanModel');

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

const request = (method, path, body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

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
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
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

const testPlanIds = [];
let superAdminToken;
let hotelAdminToken;

const runTests = async () => {
  console.log('\n🧪 Starting Subscription Plans API Automated Tests...\n');

  try {
    await startServer();

    // Setup Tokens: find super admin user from DB or generate valid token
    let superAdmin = await db('users').where({ role: 'SUPER_ADMIN' }).first();
    if (!superAdmin) {
      const [id] = await db('users').insert({
        name: 'Test Super Admin',
        email: 'test_super_admin@hotel.com',
        password: 'hashed_password_test',
        role: 'SUPER_ADMIN',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
      superAdmin = { id, role: 'SUPER_ADMIN' };
    }

    let hotelAdmin = await db('users').where({ role: 'HOTEL_ADMIN' }).first();
    if (!hotelAdmin) {
      const [id] = await db('users').insert({
        name: 'Test Hotel Admin',
        email: 'test_hotel_admin@hotel.com',
        password: 'hashed_password_test',
        role: 'HOTEL_ADMIN',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
      hotelAdmin = { id, role: 'HOTEL_ADMIN' };
    }

    superAdminToken = generateAccessToken(superAdmin.id, 'SUPER_ADMIN');
    hotelAdminToken = generateAccessToken(hotelAdmin.id, 'HOTEL_ADMIN');

    // =========================================================================
    // 1️⃣ Authentication and Authorization Guards
    // =========================================================================
    console.log('1️⃣ Testing Authentication & Authorization Guards (RBAC)');

    // POST without auth
    const postNoAuth = await request('POST', '/api/v1/subscription-plans', {
      name: 'Unauth Plan',
      billingCycle: 'MONTHLY',
      price: 5000,
    });
    assert(postNoAuth.status === 401, 'POST /api/v1/subscription-plans rejects unauthenticated request with 401');
    assert(postNoAuth.body.success === false, 'POST /api/v1/subscription-plans returns success: false');

    // POST with non-super-admin (HOTEL_ADMIN)
    const postHotelAdmin = await request(
      'POST',
      '/api/v1/subscription-plans',
      {
        name: 'Forbidden Plan',
        billingCycle: 'MONTHLY',
        price: 5000,
      },
      { Authorization: `Bearer ${hotelAdminToken}` }
    );
    assert(postHotelAdmin.status === 403, 'POST /api/v1/subscription-plans rejects HOTEL_ADMIN role with 403 Forbidden');

    // PUT without auth
    const putNoAuth = await request('PUT', '/api/v1/subscription-plans/1', { price: 6000 });
    assert(putNoAuth.status === 401, 'PUT /api/v1/subscription-plans/:id rejects unauthenticated request with 401');

    // DELETE without auth
    const delNoAuth = await request('DELETE', '/api/v1/subscription-plans/1');
    assert(delNoAuth.status === 401, 'DELETE /api/v1/subscription-plans/:id rejects unauthenticated request with 401');

    // =========================================================================
    // 2️⃣ Request Validation on Plan Creation (POST)
    // =========================================================================
    console.log('\n2️⃣ Testing POST Validation (Missing Fields, Types, Ranges)');

    // Empty body
    const postEmpty = await request(
      'POST',
      '/api/v1/subscription-plans',
      {},
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postEmpty.status === 400, 'Rejects empty payload with 400 Bad Request');
    assert(Array.isArray(postEmpty.body.errors), 'Returns errors array in response');

    // Missing billingCycle
    const postNoCycle = await request(
      'POST',
      '/api/v1/subscription-plans',
      { name: 'Plan Without Cycle', price: 1000 },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postNoCycle.status === 400, 'Rejects missing billingCycle with 400 Bad Request');

    // Invalid billingCycle
    const postBadCycle = await request(
      'POST',
      '/api/v1/subscription-plans',
      { name: 'Plan Bad Cycle', billingCycle: 'WEEKLY', price: 1000 },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postBadCycle.status === 400, 'Rejects invalid billingCycle (WEEKLY) with 400 Bad Request');

    // Negative price
    const postNegPrice = await request(
      'POST',
      '/api/v1/subscription-plans',
      { name: 'Negative Price Plan', billingCycle: 'MONTHLY', price: -500 },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postNegPrice.status === 400, 'Rejects negative price with 400 Bad Request');

    // Invalid discountPercent (> 100)
    const postBadDiscount = await request(
      'POST',
      '/api/v1/subscription-plans',
      { name: 'Invalid Discount Plan', billingCycle: 'MONTHLY', price: 1000, discountPercent: 120 },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postBadDiscount.status === 400, 'Rejects discountPercent > 100 with 400 Bad Request');

    // Invalid maxRooms (<= 0)
    const postBadRooms = await request(
      'POST',
      '/api/v1/subscription-plans',
      { name: 'Invalid Rooms Plan', billingCycle: 'MONTHLY', price: 1000, maxRooms: 0 },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postBadRooms.status === 400, 'Rejects maxRooms <= 0 with 400 Bad Request');

    // =========================================================================
    // 3️⃣ Successful Plan Creation & Feature Sanitization (POST)
    // =========================================================================
    console.log('\n3️⃣ Testing Plan Creation & Feature Sanitization');

    const newPlanPayload = {
      name: 'Test Boutique Deluxe',
      code: 'TEST_BOUTIQUE_DELUXE',
      billingCycle: 'MONTHLY',
      price: 7999,
      discountPercent: 10,
      maxRooms: 35,
      description: 'Exclusive tier for boutique testing',
      badge: 'TEST BADGE',
      isPopular: true,
      isActive: true,
      displayOrder: 10,
      features: [
        '  Front Desk Wizard  ',
        'Police Ledger',
        'Front Desk Wizard', // Duplicate to test deduplication
        '   ',                // Empty string to test filtering
        'GST Billing',
      ],
    };

    const postSuccess = await request(
      'POST',
      '/api/v1/subscription-plans',
      newPlanPayload,
      { Authorization: `Bearer ${superAdminToken}` }
    );

    assert(postSuccess.status === 201, 'POST /api/v1/subscription-plans returns 201 Created');
    assert(postSuccess.body.success === true, 'Response contains success: true');
    assert(postSuccess.body.data && postSuccess.body.data.id, 'Response returns created plan with numeric ID');

    const createdPlan = postSuccess.body.data;
    testPlanIds.push(createdPlan.id);

    assert(createdPlan.name === 'Test Boutique Deluxe', 'Plan name matches');
    assert(createdPlan.code === 'TEST_BOUTIQUE_DELUXE', 'Plan code matches uppercase normalized code');
    assert(createdPlan.billingCycle === 'MONTHLY', 'billingCycle matches MONTHLY');
    assert(createdPlan.price === 7999, 'Price is returned as number 7999');
    assert(createdPlan.discountPercent === 10, 'discountPercent is returned as number 10');
    assert(createdPlan.maxRooms === 35, 'maxRooms is returned as number 35');
    assert(createdPlan.isPopular === true, 'isPopular is true');
    assert(createdPlan.isActive === true, 'isActive is true');
    assert(createdPlan.deletedAt === null, 'deletedAt is initially null');

    // Check features: should be trimmed, empty removed, duplicates removed
    assert(Array.isArray(createdPlan.features), 'Features is an array');
    assert(createdPlan.features.length === 3, 'Features deduplicated and cleaned to 3 items');
    assert(createdPlan.features.includes('Front Desk Wizard'), 'Contains trimmed Front Desk Wizard');
    assert(createdPlan.features.includes('Police Ledger'), 'Contains Police Ledger');
    assert(createdPlan.features.includes('GST Billing'), 'Contains GST Billing');

    // =========================================================================
    // 4️⃣ Unique Code Enforcement (409 Conflict)
    // =========================================================================
    console.log('\n4️⃣ Testing Plan Code Uniqueness Constraint (409 Conflict)');

    const postDuplicate = await request(
      'POST',
      '/api/v1/subscription-plans',
      {
        name: 'Another Plan With Same Code',
        code: 'TEST_BOUTIQUE_DELUXE',
        billingCycle: 'ANNUAL',
        price: 80000,
      },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(postDuplicate.status === 409, 'Rejects duplicate code with 409 Conflict');
    assert(postDuplicate.body.success === false, 'Duplicate response returns success: false');
    assert(
      postDuplicate.body.message.includes('already exists') || postDuplicate.body.message.includes('code'),
      'Provides clear error message regarding code conflict'
    );

    // =========================================================================
    // 5️⃣ GET All Plans (Public, Pagination, Filtering, Sorting)
    // =========================================================================
    console.log('\n5️⃣ Testing GET /api/v1/subscription-plans (Public Queries, Filters, Pagination)');

    // Public list without token
    const getPublic = await request('GET', '/api/v1/subscription-plans');
    assert(getPublic.status === 200, 'GET /api/v1/subscription-plans is publicly accessible without token (200 OK)');
    assert(getPublic.body.success === true, 'Returns success: true');
    assert(Array.isArray(getPublic.body.data.plans), 'Returns data.plans array');
    assert(getPublic.body.data.pagination && getPublic.body.data.pagination.total >= 1, 'Returns pagination metadata');

    // Filter by billingCycle=MONTHLY
    const getMonthly = await request('GET', '/api/v1/subscription-plans?billingCycle=MONTHLY');
    assert(getMonthly.status === 200, 'Filters by billingCycle=MONTHLY (200 OK)');
    const allMonthly = getMonthly.body.data.plans.every((p) => p.billingCycle === 'MONTHLY');
    assert(allMonthly, 'All returned plans have billingCycle: MONTHLY');

    // Filter by billingCycle=ANNUAL
    const getAnnual = await request('GET', '/api/v1/subscription-plans?billingCycle=ANNUAL');
    assert(getAnnual.status === 200, 'Filters by billingCycle=ANNUAL (200 OK)');
    const allAnnual = getAnnual.body.data.plans.every((p) => p.billingCycle === 'ANNUAL');
    assert(allAnnual, 'All returned plans have billingCycle: ANNUAL');

    // Filter by isPopular=true
    const getPopular = await request('GET', '/api/v1/subscription-plans?isPopular=true');
    assert(getPopular.status === 200, 'Filters by isPopular=true (200 OK)');
    const allPopular = getPopular.body.data.plans.every((p) => p.isPopular === true);
    assert(allPopular, 'All returned plans have isPopular: true');

    // Pagination test (limit=2, page=1)
    const getPage1 = await request('GET', '/api/v1/subscription-plans?page=1&limit=2');
    assert(getPage1.status === 200, 'Pagination query succeeds (200 OK)');
    assert(getPage1.body.data.plans.length <= 2, 'Page limit correctly restricts results to 2 plans');
    assert(getPage1.body.data.pagination.page === 1, 'Pagination reports page 1');
    assert(getPage1.body.data.pagination.limit === 2, 'Pagination reports limit 2');

    // Alias check: /api/subscription-plans without /v1
    const getAlias = await request('GET', '/api/subscription-plans');
    assert(getAlias.status === 200, 'Dual prefix alias /api/subscription-plans works identically (200 OK)');

    // =========================================================================
    // 6️⃣ GET Single Plan by ID (GET /:id)
    // =========================================================================
    console.log('\n6️⃣ Testing GET /api/v1/subscription-plans/:id');

    // Fetch existing plan
    const getSingle = await request('GET', `/api/v1/subscription-plans/${createdPlan.id}`);
    assert(getSingle.status === 200, 'Retrieves single plan by valid ID (200 OK)');
    assert(getSingle.body.data.id === createdPlan.id, 'Returned ID matches');
    assert(getSingle.body.data.code === 'TEST_BOUTIQUE_DELUXE', 'Returned code matches');
    assert(Array.isArray(getSingle.body.data.features), 'Returned plan includes features array');

    // Non-existent ID (999999)
    const getNonExistent = await request('GET', '/api/v1/subscription-plans/999999');
    assert(getNonExistent.status === 404, 'Returns 404 Not Found for non-existent ID');
    assert(getNonExistent.body.success === false, 'Returns success: false on 404');

    // Invalid non-numeric ID
    const getBadId = await request('GET', '/api/v1/subscription-plans/invalid-id');
    assert(getBadId.status === 400, 'Returns 400 Bad Request for non-integer ID');

    // =========================================================================
    // 7️⃣ PUT Update Plan Details & Feature Synchronization
    // =========================================================================
    console.log('\n7️⃣ Testing PUT /api/v1/subscription-plans/:id (Partial Update & Feature Sync)');

    // Partial update: price, badge, maxRooms (leaves name, features unchanged)
    const putPartial = await request(
      'PUT',
      `/api/v1/subscription-plans/${createdPlan.id}`,
      {
        price: 8999,
        badge: 'UPDATED TIER',
        maxRooms: 40,
      },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(putPartial.status === 200, 'Partial update succeeds with 200 OK');
    assert(putPartial.body.data.price === 8999, 'Price updated to 8999');
    assert(putPartial.body.data.badge === 'UPDATED TIER', 'Badge updated to UPDATED TIER');
    assert(putPartial.body.data.maxRooms === 40, 'maxRooms updated to 40');
    assert(putPartial.body.data.name === 'Test Boutique Deluxe', 'Preserved original name without overwrite');
    assert(putPartial.body.data.features.length === 3, 'Preserved existing features without overwrite');

    // Synchronize features: pass new feature list
    const putFeatures = await request(
      'PUT',
      `/api/v1/subscription-plans/${createdPlan.id}`,
      {
        features: ['Brand New Feature 1', 'Brand New Feature 2'],
      },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(putFeatures.status === 200, 'Feature synchronization succeeds with 200 OK');
    assert(putFeatures.body.data.features.length === 2, 'Features synchronized to 2 items');
    assert(putFeatures.body.data.features[0] === 'Brand New Feature 1', 'Feature 1 matches');
    assert(putFeatures.body.data.features[1] === 'Brand New Feature 2', 'Feature 2 matches');

    // Verify in database directly
    const dbFeatures = await db('subscription_plan_features')
      .where({ plan_id: createdPlan.id })
      .select('feature');
    assert(dbFeatures.length === 2, 'Database table subscription_plan_features synchronized to 2 records');

    // Try updating code to a code that belongs to another plan
    const putConflictCode = await request(
      'PUT',
      `/api/v1/subscription-plans/${createdPlan.id}`,
      { code: 'MONTHLY_PRO' },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(putConflictCode.status === 409, 'Rejects update when code conflicts with existing plan (409 Conflict)');

    // Update non-existent plan ID
    const putNotFound = await request(
      'PUT',
      '/api/v1/subscription-plans/999999',
      { price: 1000 },
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(putNotFound.status === 404, 'Returns 404 Not Found when updating non-existent plan');

    // =========================================================================
    // 8️⃣ DELETE Soft Deletion & Query Exclusion
    // =========================================================================
    console.log('\n8️⃣ Testing DELETE /api/v1/subscription-plans/:id (Soft Deletion)');

    const deleteRes = await request(
      'DELETE',
      `/api/v1/subscription-plans/${createdPlan.id}`,
      null,
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(deleteRes.status === 200, 'Soft-delete succeeds with 200 OK');
    assert(deleteRes.body.success === true, 'Response contains success: true');
    assert(deleteRes.body.data.isDeleted === true, 'Response indicates isDeleted: true');
    assert(deleteRes.body.data.isActive === false, 'Response indicates isActive: false');

    // Verify in DB that record is NOT physically deleted
    const dbRecord = await db('subscription_plans').where({ id: createdPlan.id }).first();
    assert(dbRecord !== undefined, 'Database record still exists (NOT permanently deleted)');
    assert(dbRecord.deleted_at !== null, 'deleted_at timestamp is set in database');
    assert(Boolean(dbRecord.is_active) === false, 'is_active is set to false in database');

    // Verify GET /:id returns 404 for soft-deleted plan
    const getSoftDeleted = await request('GET', `/api/v1/subscription-plans/${createdPlan.id}`);
    assert(getSoftDeleted.status === 404, 'GET /:id excludes soft-deleted plan (404 Not Found)');

    // Verify GET all plans does not list the soft-deleted plan
    const getAllAfterDelete = await request('GET', '/api/v1/subscription-plans');
    const existsInList = getAllAfterDelete.body.data.plans.some((p) => p.id === createdPlan.id);
    assert(!existsInList, 'GET list excludes soft-deleted plan from results');

    // Attempting to delete again returns 404
    const deleteAgain = await request(
      'DELETE',
      `/api/v1/subscription-plans/${createdPlan.id}`,
      null,
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(deleteAgain.status === 404, 'Deleting already soft-deleted plan returns 404 Not Found');

    // Deleting non-existent ID
    const deleteNonExistent = await request(
      'DELETE',
      '/api/v1/subscription-plans/999999',
      null,
      { Authorization: `Bearer ${superAdminToken}` }
    );
    assert(deleteNonExistent.status === 404, 'Deleting non-existent plan returns 404 Not Found');

  } catch (err) {
    console.error('Test execution error:', err);
    failCount++;
  } finally {
    console.log('\n🧹 Cleaning up test subscription plans from database...');
    for (const id of testPlanIds) {
      await subscriptionPlanModel.hardDeletePlan(id);
    }
    // Also clean up any TEST_% plans
    const remainingTest = await db('subscription_plans').where('code', 'like', 'TEST_%').select('id');
    for (const r of remainingTest) {
      await subscriptionPlanModel.hardDeletePlan(r.id);
    }
    console.log('  ✅ Cleanup complete');

    await stopServer();

    console.log('\n======================================================');
    console.log(`🎉 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('======================================================\n');

    process.exit(failCount > 0 ? 1 : 0);
  }
};

runTests();
