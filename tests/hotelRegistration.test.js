/**
 * Automated Test Suite for Hotel Registration API
 * Tests POST /api/v1/hotel/register and POST /api/v1/hotels/register
 */
process.env.NODE_ENV = 'test';
const http = require('http');
const bcrypt = require('bcryptjs');
const app = require('../app');
const db = require('../database/knex');

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

const createdHotelIds = [];
const createdUserIds = [];

const cleanup = async () => {
  try {
    if (createdHotelIds.length > 0) {
      await db('hotels').whereIn('id', createdHotelIds).del();
    }
    if (createdUserIds.length > 0) {
      await db('password_reset_tokens').whereIn('user_id', createdUserIds).del();
      await db('users').whereIn('id', createdUserIds).del();
    }
    const testUsers = await db('users').where('email', 'like', '%test_hotel_%').select('id');
    const testUserIds = testUsers.map((u) => u.id);
    if (testUserIds.length > 0) {
      await db('hotels').whereIn('owner_id', testUserIds).del();
      await db('password_reset_tokens').whereIn('user_id', testUserIds).del();
      await db('users').whereIn('id', testUserIds).del();
    }
  } catch (err) {
    console.warn('Cleanup error:', err.message);
  }
};

let passCount = 0;
let failCount = 0;

const assert = (condition, description) => {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failCount++;
  }
};

const runTests = async () => {
  console.log('\n🧪 Starting Hotel Registration API Automated Tests...\n');
  await startServer();

  try {
    // =========================================================================
    // 1️⃣ Testing Request Validation - Missing Required Fields
    // =========================================================================
    console.log('1️⃣ Testing Request Validation - Missing Required Fields');
    const res1 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data1 = await res1.json();

    assert(res1.status === 400, 'Rejects empty payload with 400 Bad Request');
    assert(data1.success === false, 'Returns success: false for invalid payload');
    assert(Array.isArray(data1.errors) && data1.errors.length > 0, 'Returns errors array');

    const fieldsWithErrors = data1.errors.map((e) => e.field);
    assert(fieldsWithErrors.includes('name'), 'Reports missing hotel name error');
    assert(fieldsWithErrors.includes('owner_name'), 'Reports missing owner_name error');
    assert(fieldsWithErrors.includes('owner_email'), 'Reports missing owner_email error');
    assert(fieldsWithErrors.includes('owner_phone'), 'Reports missing owner_phone error');
    assert(fieldsWithErrors.includes('address'), 'Reports missing address error');
    assert(fieldsWithErrors.includes('city'), 'Reports missing city error');
    assert(fieldsWithErrors.includes('state'), 'Reports missing state error');
    assert(fieldsWithErrors.includes('pincode'), 'Reports missing pincode error');

    // =========================================================================
    // 2️⃣ Testing Format Validation - Malformed Email, Mobile, Pincode
    // =========================================================================
    console.log('\n2️⃣ Testing Format Validation - Invalid Email, Mobile, Pincode');
    const res2 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Grand Test Palace',
        owner_name: 'Vikram Mehta',
        owner_email: 'not-an-email',
        owner_phone: '12345',
        address: '100 Heritage Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '999',
      }),
    });
    const data2 = await res2.json();

    assert(res2.status === 400, 'Rejects invalid format fields with 400 Bad Request');
    const errFields2 = data2.errors.map((e) => e.field);
    assert(errFields2.includes('owner_email'), 'Rejects malformed email');
    assert(errFields2.includes('owner_phone'), 'Rejects invalid mobile number');
    assert(errFields2.includes('pincode'), 'Rejects invalid pincode');

    // =========================================================================
    // 3️⃣ Testing Optional Fields Format Validation (GSTIN, PAN, Disallowed files)
    // =========================================================================
    console.log('\n3️⃣ Testing Optional Fields Format Validation');
    const res3 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Grand Test Palace',
        owner_name: 'Vikram Mehta',
        owner_email: 'valid_test@example.com',
        owner_phone: '9876543210',
        address: '100 Heritage Road',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
        gst_number: 'INVALID_GSTIN_123',
        pan_number: 'INVALID_PAN',
        total_rooms: -5,
      }),
    });
    const data3 = await res3.json();

    assert(res3.status === 400, 'Rejects invalid optional formats with 400 Bad Request');
    const errFields3 = data3.errors.map((e) => e.field);
    assert(errFields3.includes('gst_number'), 'Catches invalid GSTIN format');
    assert(errFields3.includes('pan_number'), 'Catches invalid PAN format');
    assert(errFields3.includes('total_rooms'), 'Catches negative total_rooms');

    // =========================================================================
    // 4️⃣ Testing Global Email Uniqueness Guard
    // =========================================================================
    console.log('\n4️⃣ Testing Global Email Uniqueness Guard');
    // We know 'admin@hotel.com' was seeded in users table
    const res4 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Conflict Hotel',
        owner_name: 'Conflict Owner',
        owner_email: 'admin@hotel.com',
        owner_phone: '9876543210',
        address: '100 Conflict Way',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      }),
    });
    const data4 = await res4.json();

    assert(res4.status === 409, 'Rejects duplicate email with 409 Conflict');
    assert(data4.success === false, 'Returns success: false for duplicate email');
    assert(
      data4.message.includes('already registered') || data4.message.includes('already exists'),
      'Provides clear uniqueness conflict message'
    );

    // =========================================================================
    // 5️⃣ Testing Hotel Registration (Temporary Password & Setup Token Flow)
    // =========================================================================
    console.log('\n5️⃣ Testing Hotel Registration (Temporary Password & Setup Token Flow)');
    const uniqueEmail1 = `test_hotel_${Date.now()}@example.com`;
    const res5 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'The Royal Oasis',
        owner_name: 'Rajesh Sharma',
        owner_email: uniqueEmail1,
        owner_phone: '+91 9825123456', // Valid Indian mobile with +91 prefix
        address: '42 Lake View Boulevard',
        city: 'Udaipur',
        state: 'Rajasthan',
        country: 'India',
        pincode: '313001',
        gst_number: '24AAAAA0000A1Z5',
        pan_number: 'ABCDE1234F',
        total_rooms: 35,
        hotel_type: 'Heritage Resort',
      }),
    });
    const data5 = await res5.json();

    assert(res5.status === 201, 'Returns 201 Created on valid registration');
    assert(data5.success === true, 'Returns success: true');
    assert(Boolean(data5.data?.hotel?.id), 'Returns created hotel with ID');
    assert(data5.data.hotel.name === 'The Royal Oasis', 'Hotel name matches');
    assert(data5.data.hotel.slug.includes('the-royal-oasis'), 'Slug generated correctly');
    assert(data5.data.hotel.status === 'ACTIVE', 'Hotel status is ACTIVE');
    assert(data5.data.hotel.subscription_plan_id !== undefined, 'subscription_plan_id is present');
    assert(data5.data.hotel.subscription_plan_active === true, 'subscription_plan_active is true');
    assert(Boolean(data5.data.hotel.subscription_plan_start_date), 'subscription_plan_start_date is populated');
    assert(Boolean(data5.data.hotel.subscription_plan_end_date), 'subscription_plan_end_date is populated');
    assert(data5.data.hotel.subscription?.active === true, 'subscription.active is true');
    assert(data5.data.hotel.subscription?.auto_renew === false, 'auto_renew is false');

    // Default settings
    assert(data5.data.hotel.settings?.check_in_time === '14:00', 'Default check-in time is 14:00');
    assert(data5.data.hotel.settings?.check_out_time === '12:00', 'Default check-out time is 12:00');
    assert(data5.data.hotel.settings?.timezone === 'Asia/Kolkata', 'Timezone is Asia/Kolkata');
    assert(data5.data.hotel.settings?.defaultGstRate === undefined, 'Deprecated defaultGstRate removed');
    assert(data5.data.hotel.settings?.upi_id === '', 'No hardcoded default UPI ID');

    // Admin details
    assert(Boolean(data5.data?.admin?.id), 'Admin user created with ID');
    assert(data5.data.admin.role === 'HOTEL_ADMIN', 'Admin role is HOTEL_ADMIN');
    assert(data5.data.admin.hotel_id === data5.data.hotel.id, 'Admin user links to hotel.id');
    assert(data5.data.hotel.owner_id === data5.data.admin.id, 'Hotel owner_id stores the admin user ID');
    assert(data5.data.hotel.ownerName === undefined, 'Duplicate ownerName removed from hotel object');
    assert(data5.data.hotel.ownerEmail === undefined, 'Duplicate ownerEmail removed from hotel object');
    assert(data5.data.hotel.ownerPhone === undefined, 'Duplicate ownerPhone removed from hotel object');

    // Database schema check: verify hotel record in DB has owner_id and no duplicate owner columns
    const dbHotel = await db('hotels').where({ id: data5.data.hotel.id }).first();
    assert(dbHotel.owner_id === data5.data.admin.id, 'Database hotel record stores owner_id foreign key');
    assert(dbHotel.owner_name === undefined, 'Database hotel table no longer has owner_name column');

    assert(data5.data.admin.mustChangePassword === undefined, 'mustChangePassword key is removed from admin response');

    // Verify PasswordResetToken setup token was generated
    const setupTokenRecord5 = await db('password_reset_tokens').where({ user_id: data5.data.admin.id }).first();
    assert(Boolean(setupTokenRecord5), 'Generates secure PasswordResetToken for expiring setup link in temp password flow');
    assert(setupTokenRecord5.token.length >= 32, 'Setup token has cryptographically secure length');

    // Security check: No password or password hash exposed
    assert(data5.data.admin.password === undefined, 'Does not expose plaintext password in admin data');
    assert(data5.data.hotel.password === undefined, 'Does not expose password in hotel data');
    assert(data5.data.auth?.access_token !== undefined, 'Issues Bearer access token');

    // Cookies check
    const cookiesHeader = res5.headers.get('set-cookie');
    assert(Boolean(cookiesHeader) && cookiesHeader.includes('accessToken='), 'Sets HttpOnly accessToken cookie');
    assert(Boolean(cookiesHeader) && cookiesHeader.includes('refreshToken='), 'Sets HttpOnly refreshToken cookie');

    // Track for cleanup
    createdHotelIds.push(data5.data.hotel.id);
    createdUserIds.push(data5.data.admin.id);

    // =========================================================================
    // 6️⃣ Testing Hotel Registration without Password (Secure Setup Link & Temp Pass)
    // =========================================================================
    console.log('\n6️⃣ Testing Hotel Registration without Password');
    const uniqueEmail2 = `test_hotel_nopass_${Date.now()}@example.com`;
    const res6 = await fetch(`${baseUrl}/api/v1/hotels/register`, { // Testing plural route mount
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'The Grand View Hotel',
        owner_name: 'Pooja Patel',
        owner_email: uniqueEmail2,
        owner_phone: '09876543210', // Valid with leading 0
        address: '55 Hill View Lane',
        city: 'Shimla',
        state: 'Himachal Pradesh',
        pincode: '171001',
      }),
    });
    const data6 = await res6.json();

    assert(res6.status === 201, 'Returns 201 Created on registration without password (via /hotels/register)');
    assert(data6.data.admin.mustChangePassword === undefined, 'mustChangePassword key is removed from admin response');
    assert(data6.data.admin.password === undefined, 'Does not expose temporary password in API response');

    // Verify database record has secure bcrypt hash NOT derived from owner name
    const dbAdmin = await db('users').where({ id: data6.data.admin.id }).first();
    assert(Boolean(dbAdmin), 'Admin user exists in database');
    assert(dbAdmin.password.startsWith('$2'), 'Password is stored as bcrypt hash');

    // Verify not derived from owner name
    const matchesOwnerName = await bcrypt.compare('Pooja Patel', dbAdmin.password);
    const matchesOwnerFirstName = await bcrypt.compare('Pooja@123', dbAdmin.password);
    assert(!matchesOwnerName && !matchesOwnerFirstName, 'Temporary password is NOT derived from owner name');

    // Verify PasswordResetToken setup token was generated
    const setupTokenRecord = await db('password_reset_tokens').where({ user_id: data6.data.admin.id }).first();
    assert(Boolean(setupTokenRecord), 'Generates secure PasswordResetToken for expiring setup link');
    assert(setupTokenRecord.token.length >= 32, 'Setup token has cryptographically secure length');

    createdHotelIds.push(data6.data.hotel.id);
    createdUserIds.push(data6.data.admin.id);

    // =========================================================================
    // 7️⃣ Testing Slug Collision Resilience
    // =========================================================================
    console.log('\n7️⃣ Testing Slug Collision Resilience');
    const uniqueEmail3 = `test_hotel_col_${Date.now()}@example.com`;
    const res7 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'The Royal Oasis', // Same name as test 5!
        owner_name: 'Amit Verma',
        owner_email: uniqueEmail3,
        owner_phone: '9123456789',
        address: '77 Heritage Boulevard',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001',
        password: 'SecretPassword@123',
      }),
    });
    const data7 = await res7.json();

    assert(res7.status === 201, 'Handles matching name by generating distinct slug with 201 Created');
    assert(data7.data.hotel.slug !== data5.data.hotel.slug, 'New slug does not collide with existing hotel slug');
    assert(data7.data.hotel.slug.startsWith('the-royal-oasis'), 'New slug retains base prefix');

    createdHotelIds.push(data7.data.hotel.id);
    createdUserIds.push(data7.data.admin.id);

    // =========================================================================
    // 8️⃣ Testing Hotel Registration with Explicit Subscription Plan ID, Status & Dates
    // =========================================================================
    console.log('\n8️⃣ Testing Hotel Registration with Explicit Subscription Plan ID & Status');
    const uniqueEmail4 = `test_hotel_subplan_${Date.now()}@example.com`;
    const explicitStartDate = new Date('2026-10-15T00:00:00.000Z');
    const explicitEndDate = new Date('2027-10-15T00:00:00.000Z');

    const res8 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'The Grand Heritage',
        owner_name: 'Vikramaditya Rao',
        owner_email: uniqueEmail4,
        owner_phone: '9876501234',
        address: '100 Royal Crescent',
        city: 'Udaipur',
        state: 'Rajasthan',
        pincode: '313001',
        password: 'GrandPassword@123',
        subscription_plan_id: 2,
        subscription_plan_active: true,
        subscription_plan_start_date: explicitStartDate.toISOString(),
        subscription_plan_end_date: explicitEndDate.toISOString(),
      }),
    });

    const data8 = await res8.json();
    assert(res8.status === 201, 'Returns 201 Created on registration with explicit subscription plan');
    assert(data8.data.hotel.subscription_plan_id === 2, 'Explicit subscription_plan_id is stored');
    assert(data8.data.hotel.subscription_plan_active === true, 'Explicit subscription_plan_active is true');

    const dbHotel8 = await db('hotels').where({ id: data8.data.hotel.id }).first();
    assert(dbHotel8.subscription_plan_id === 2, 'Database row has correct subscription_plan_id');
    assert(Boolean(dbHotel8.subscription_plan_active) === true, 'Database row has subscription_plan_active: true');

    createdHotelIds.push(data8.data.hotel.id);
    createdUserIds.push(data8.data.admin.id);

    // =========================================================================
    // 9️⃣ Testing Hotel Registration via multipart/form-data with Logo Upload
    // =========================================================================
    console.log('\n9️⃣ Testing Hotel Registration via multipart/form-data with Logo Upload');
    const uniqueEmail5 = `test_hotel_formdata_${Date.now()}@example.com`;
    const formData = new FormData();
    formData.append('name', 'Seaside Coral Resort');
    formData.append('owner_name', 'Karan Singhania');
    formData.append('owner_email', uniqueEmail5);
    formData.append('owner_phone', '9812345678');
    formData.append('address', '12 Ocean Drive');
    formData.append('city', 'Goa');
    formData.append('state', 'Goa');
    formData.append('pincode', '403001');
    formData.append('total_rooms', '40');
    formData.append('upi_id', 'customupi@bank');
    const dummyLogo = new Blob(['fake-image-bytes-for-hotel-logo'], { type: 'image/png' });
    formData.append('logo', dummyLogo, 'hotel_logo.png');

    const res9 = await fetch(`${baseUrl}/api/v1/hotel/register`, {
      method: 'POST',
      body: formData,
    });
    const data9 = await res9.json();

    assert(res9.status === 201, 'Returns 201 Created on multipart/form-data registration');
    assert(Boolean(data9.data?.hotel?.id), 'Hotel created via form-data');
    assert(data9.data.hotel.name === 'Seaside Coral Resort', 'Hotel name matches form-data');
    assert(Boolean(data9.data.hotel.logo), 'Logo URL stored from S3 upload');
    assert(data9.data.hotel.settings?.upi_id === 'customupi@bank', 'Custom upi_id preserved from form-data');

    if (data9.data?.hotel?.id) createdHotelIds.push(data9.data.hotel.id);
    if (data9.data?.admin?.id) createdUserIds.push(data9.data.admin.id);

    // =========================================================================
    // 🔟 Clean up
    // =========================================================================
    console.log('\n🧹 Cleaning up test records from database...');
    await cleanup();
    console.log('  ✅ Cleanup complete');

  } catch (err) {
    console.error('Test execution error:', err);
    failCount++;
  } finally {
    await stopServer();
    await db.destroy();
  }

  console.log('\n======================================================');
  console.log(`🎉 TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
};

runTests();
