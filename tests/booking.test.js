/**
 * Automated Test Suite for Booking Module APIs.
 * Tests POST, GET, GET /:id, PUT, DELETE /api/v1/bookings
 * Validates financial calculations, S3 media uploads with is_signature flag,
 * date overlap prevention, and soft deletion.
 */
const http = require('http');
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

const makeRequest = (path, { method = 'GET', headers = {}, body = null } = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);

    const reqHeaders = { ...headers };
    if (body && !Buffer.isBuffer(body) && typeof body === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
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
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      }
    }
    req.end();
  });
};

const buildMultipartPayload = (fields = {}, files = []) => {
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;
  const chunks = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
      )
    );
  }

  for (const file of files) {
    const fieldname = file.fieldname || 'images';
    const filename = file.filename || 'media.jpg';
    const contentType = file.contentType || 'image/jpeg';
    const content = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content || 'test content');

    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldname}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
      )
    );
    chunks.push(content);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);

  return {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
    body,
  };
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

let hotel1Id;
let hotel2Id;
let roomType1Id;
let room1Id;
let room2Id;
let inactiveRoomId;
let hotel2RoomId;
let staffUserId;
let staffToken;

const createdBookingIds = [];
const createdHotelIds = [];
const createdRoomTypeIds = [];
const createdRoomIds = [];
const createdUserIds = [];

const setupTestData = async () => {
  // 1. Setup staff & admin users
  let user = await db('users').where({ email: 'booking_staff@hotel.com' }).first();
  if (!user) {
    const [uid] = await db('users').insert({
      name: 'Booking Staff User',
      email: 'booking_staff@hotel.com',
      password: 'hashed_password_123',
      role: 'RECEPTIONIST',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    staffUserId = uid;
    createdUserIds.push(uid);
  } else {
    staffUserId = user.id;
  }

  staffToken = generateAccessToken(staffUserId, 'RECEPTIONIST');

  // 2. Setup Hotel 1 & Hotel 2
  let h1 = await db('hotels').where({ slug: 'booking-test-hotel-1' }).first();
  if (!h1) {
    const [hid] = await db('hotels').insert({
      name: 'Booking Test Hotel 1',
      slug: 'booking-test-hotel-1',
      owner_id: staffUserId,
      address: '100 Beach Boulevard',
      city: 'Goa',
      state: 'Goa',
      country: 'India',
      pincode: '403001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel1Id = hid;
    createdHotelIds.push(hid);
  } else {
    hotel1Id = h1.id;
  }

  let h2 = await db('hotels').where({ slug: 'booking-test-hotel-2' }).first();
  if (!h2) {
    const [hid2] = await db('hotels').insert({
      name: 'Booking Test Hotel 2',
      slug: 'booking-test-hotel-2',
      owner_id: staffUserId,
      address: '200 Mountain Peak',
      city: 'Manali',
      state: 'Himachal Pradesh',
      country: 'India',
      pincode: '175131',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel2Id = hid2;
    createdHotelIds.push(hid2);
  } else {
    hotel2Id = h2.id;
  }

  // 3. Setup Room Type
  let rt = await db('room_types').where({ hotel_id: hotel1Id, name: 'Deluxe Sea View' }).whereNull('deleted_at').first();
  if (!rt) {
    const [rtid] = await db('room_types').insert({
      hotel_id: hotel1Id,
      name: 'Deluxe Sea View',
      description: 'Spacious room facing the ocean.',
      created_at: new Date(),
      updated_at: new Date(),
    });
    roomType1Id = rtid;
    createdRoomTypeIds.push(rtid);
  } else {
    roomType1Id = rt.id;
  }

  // 4. Setup Rooms for Hotel 1
  let r1 = await db('rooms').where({ hotel_id: hotel1Id, floor: 1, room_number: '101' }).whereNull('deleted_at').first();
  if (!r1) {
    const [rid1] = await db('rooms').insert({
      hotel_id: hotel1Id,
      room_type_id: roomType1Id,
      floor: 1,
      room_number: '101',
      status: 'AVAILABLE',
      custom_price_per_night: 3500.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    room1Id = rid1;
    createdRoomIds.push(rid1);
  } else {
    room1Id = r1.id;
  }

  let r2 = await db('rooms').where({ hotel_id: hotel1Id, floor: 1, room_number: '102' }).whereNull('deleted_at').first();
  if (!r2) {
    const [rid2] = await db('rooms').insert({
      hotel_id: hotel1Id,
      room_type_id: roomType1Id,
      floor: 1,
      room_number: '102',
      status: 'AVAILABLE',
      custom_price_per_night: 4000.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    room2Id = rid2;
    createdRoomIds.push(rid2);
  } else {
    room2Id = r2.id;
  }

  // Inactive Room
  let rInact = await db('rooms').where({ hotel_id: hotel1Id, floor: 1, room_number: '103-INACTIVE' }).whereNull('deleted_at').first();
  if (!rInact) {
    const [rInactId] = await db('rooms').insert({
      hotel_id: hotel1Id,
      room_type_id: roomType1Id,
      floor: 1,
      room_number: '103-INACTIVE',
      status: 'OUT_OF_SERVICE',
      custom_price_per_night: 2000.00,
      is_active: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    inactiveRoomId = rInactId;
    createdRoomIds.push(rInactId);
  } else {
    inactiveRoomId = rInact.id;
  }

  // Hotel 2 Room
  let rH2 = await db('rooms').where({ hotel_id: hotel2Id, floor: 1, room_number: '201' }).whereNull('deleted_at').first();
  if (!rH2) {
    const [rH2Id] = await db('rooms').insert({
      hotel_id: hotel2Id,
      room_type_id: roomType1Id,
      floor: 1,
      room_number: '201',
      status: 'AVAILABLE',
      custom_price_per_night: 5000.00,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel2RoomId = rH2Id;
    createdRoomIds.push(rH2Id);
  } else {
    hotel2RoomId = rH2.id;
  }
};

const cleanupTestData = async () => {
  try {
    if (createdBookingIds.length > 0) {
      await db('images').whereIn('booking_id', createdBookingIds).del();
      await db('bookings').whereIn('id', createdBookingIds).del();
    }
    if (createdRoomIds.length > 0) {
      await db('images').whereIn('room_id', createdRoomIds).del();
      await db('rooms').whereIn('id', createdRoomIds).del();
    }
    if (createdRoomTypeIds.length > 0) {
      await db('images').whereIn('room_type_id', createdRoomTypeIds).del();
      await db('room_types').whereIn('id', createdRoomTypeIds).del();
    }
    if (createdHotelIds.length > 0) {
      await db('hotels').whereIn('id', createdHotelIds).del();
    }
    if (createdUserIds.length > 0) {
      await db('users').whereIn('id', createdUserIds).del();
    }
  } catch (err) {
    console.warn('Cleanup error:', err.message);
  }
};

const runTests = async () => {
  console.log('\n🧪 Starting Booking Module Automated Tests...\n');
  await startServer();
  await setupTestData();

  try {
    // =========================================================================
    // 1️⃣ Validation & Preconditions Tests
    // =========================================================================
    console.log('--- 1. Testing POST Validation Failures & Business Guards ---');

    // Missing payload
    const resEmpty = await makeRequest('/api/v1/bookings', { method: 'POST', body: {} });
    assert(resEmpty.status === 400, 'Rejects empty payload with 400 Bad Request');
    assert(resEmpty.body.success === false, 'Returns success: false for invalid payload');

    // Check-out date earlier than check-in date
    const resBadDates = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      body: {
        hotel_id: hotel1Id,
        primary_guest_name: 'Aditya Roy',
        mobile_number: '+919876543210',
        room_id: room1Id,
        check_in_date: '2026-11-20T14:00:00Z',
        check_out_date: '2026-11-19T11:00:00Z', // Before check-in!
      },
    });
    assert(resBadDates.status === 400, 'Rejects check-out earlier than check-in with 400 Bad Request');
    assert(
      resBadDates.body.message.includes('after check_in_date') || resBadDates.body.message.includes('dates'),
      'Clear error message explaining check-out must be after check-in'
    );

    // Non-existent hotel
    const resNoHotel = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      body: {
        hotel_id: 999999,
        primary_guest_name: 'Aditya Roy',
        mobile_number: '+919876543210',
        room_id: room1Id,
        check_in_date: '2026-11-20T14:00:00Z',
        check_out_date: '2026-11-22T11:00:00Z',
      },
    });
    assert(resNoHotel.status === 400, 'Rejects non-existent hotel with 400 Bad Request');

    // Inactive room
    const resInactive = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      body: {
        hotel_id: hotel1Id,
        primary_guest_name: 'Aditya Roy',
        mobile_number: '+919876543210',
        room_id: inactiveRoomId,
        check_in_date: '2026-11-20T14:00:00Z',
        check_out_date: '2026-11-22T11:00:00Z',
      },
    });
    assert(resInactive.status === 400, 'Rejects inactive room with 400 Bad Request');

    // Cross-hotel mismatched room
    const resWrongHotelRoom = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      body: {
        hotel_id: hotel1Id,
        primary_guest_name: 'Aditya Roy',
        mobile_number: '+919876543210',
        room_id: hotel2RoomId, // Belongs to Hotel 2!
        check_in_date: '2026-11-20T14:00:00Z',
        check_out_date: '2026-11-22T11:00:00Z',
      },
    });
    assert(resWrongHotelRoom.status === 400, 'Rejects room belonging to different hotel with 400 Bad Request');

    // =========================================================================
    // 2️⃣ Successful Booking Creation with Calculations & Media
    // =========================================================================
    console.log('\n--- 2. Testing POST /api/v1/bookings (Creation, Taxes, S3 Media & is_signature) ---');

    const fakeImage = Buffer.from('fake image content');
    const fakeSignature = Buffer.from('fake signature svg/png content');

    const multipart = buildMultipartPayload(
      {
        hotel_id: hotel1Id,
        primary_guest_name: 'Rahul Sharma',
        secondary_guest_name: 'Ananya Sharma',
        mobile_number: '9876543210',
        address: '42 Marine Drive, Mumbai',
        room_id: room1Id,
        check_in_date: '2026-11-01T14:00:00Z',
        check_out_date: '2026-11-04T11:00:00Z', // 3 nights
        adults: 2,
        children: 1,
        discount_amount: 500.00,
        extra_charges_total: 200.00,
        paid_amount: 5000.00, // Partially paid
        gst_rate: 18.00,
        notes: 'Late arrival requested',
      },
      [
        { fieldname: 'images', filename: 'guest_id.jpg', contentType: 'image/jpeg', content: fakeImage },
        { fieldname: 'signature', filename: 'guest_sign.png', contentType: 'image/png', content: fakeSignature },
      ]
    );

    const createRes = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${staffToken}`,
        ...multipart.headers,
      },
      body: multipart.body,
    });

    assert(createRes.status === 201, 'POST /api/v1/bookings returns 201 Created');
    assert(createRes.body.success === true, 'Returns success: true');

    const booking1 = createRes.body.data;
    assert(Boolean(booking1?.id), 'Returns created booking with numeric ID');
    assert(booking1.booking_number.startsWith('BK-'), 'Generated booking number has BK- prefix');
    assert(booking1.primary_guest_name === 'Rahul Sharma', 'Primary guest name matches');
    assert(booking1.secondary_guest_name === 'Ananya Sharma', 'Secondary guest name matches');
    assert(booking1.number_of_nights === 3, 'Calculated number_of_nights is 3');

    // Financial calculations:
    // Room 1 (3500) * 3 nights = 10500 base amount
    // Discount: 500 -> Taxable: 10500 - 500 + 200 = 10200
    // GST (18%): 10200 * 0.18 = 1836
    // CGST (9%): 918, SGST (9%): 918
    // Total Amount: 10200 + 1836 = 12036
    // Paid: 5000 -> Due: 12036 - 5000 = 7036
    // Payment Status: PARTIALLY_PAID
    assert(booking1.base_amount === 10500, `Base amount computed correctly as 10500 (got ${booking1.base_amount})`);
    assert(booking1.discount_amount === 500, 'Discount amount is 500');
    assert(booking1.extra_charges_total === 200, 'Extra charges total is 200');
    assert(booking1.taxable_amount === 10200, `Taxable amount is 10200 (got ${booking1.taxable_amount})`);
    assert(booking1.gst_rate === 18, 'GST rate is 18%');
    assert(booking1.cgst_rate === 9, 'CGST rate is 9%');
    assert(booking1.sgst_rate === 9, 'SGST rate is 9%');
    assert(booking1.gst_amount === 1836, `GST amount is 1836 (got ${booking1.gst_amount})`);
    assert(booking1.cgst_amount === 918, `CGST amount is 918 (got ${booking1.cgst_amount})`);
    assert(booking1.sgst_amount === 918, `SGST amount is 918 (got ${booking1.sgst_amount})`);
    assert(booking1.total_amount === 12036, `Total amount is 12036 (got ${booking1.total_amount})`);
    assert(booking1.paid_amount === 5000, 'Paid amount is 5000');
    assert(booking1.due_amount === 7036, `Due amount is 7036 (got ${booking1.due_amount})`);
    assert(booking1.payment_status === 'PARTIALLY_PAID', 'Derived payment status is PARTIALLY_PAID');

    // Media verification
    assert(Array.isArray(booking1.images) && booking1.images.length >= 1, 'Returns uploaded image URLs in images array');
    assert(Array.isArray(booking1.signatures) && booking1.signatures.length >= 1, 'Returns uploaded signature URL in signatures array');

    // Verify images table in MySQL
    const dbImages = await db('images').where({ booking_id: booking1.id });
    assert(dbImages.length >= 2, 'Unified images table stores records with booking_id');
    const dbSig = dbImages.find((img) => Boolean(img.is_signature));
    assert(Boolean(dbSig), 'Stores signature record with is_signature = true');
    const dbPhoto = dbImages.find((img) => !img.is_signature);
    assert(Boolean(dbPhoto), 'Stores photo record with is_signature = false');

    createdBookingIds.push(booking1.id);

    // =========================================================================
    // 3️⃣ Date Overlap Prevention Tests
    // =========================================================================
    console.log('\n--- 3. Testing Overlapping Booking Prevention Guard ---');

    // Colliding dates for room1: 2026-11-02 to 2026-11-05 (overlaps with 2026-11-01 to 2026-11-04)
    const resOverlap = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: {
        hotel_id: hotel1Id,
        primary_guest_name: 'Pooja Hegde',
        mobile_number: '9123456780',
        room_id: room1Id,
        check_in_date: '2026-11-02T14:00:00Z',
        check_out_date: '2026-11-05T11:00:00Z',
      },
    });

    assert(resOverlap.status === 409, 'Rejects overlapping booking with 409 Conflict');
    assert(resOverlap.body.success === false, 'Returns success: false for overlap');
    assert(
      resOverlap.body.message.includes('already booked') || resOverlap.body.message.includes('Overlapping'),
      'Error message identifies room overlap and conflicting booking'
    );

    // Non-overlapping booking for room1 on different dates (e.g. 2026-11-10 to 2026-11-12)
    const resNonOverlap = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: {
        hotel_id: hotel1Id,
        primary_guest_name: 'Pooja Hegde',
        mobile_number: '9123456780',
        room_id: room1Id,
        check_in_date: '2026-11-10T14:00:00Z',
        check_out_date: '2026-11-12T11:00:00Z', // 2 nights
        base_amount: 7000.00,
        paid_amount: 8260.00, // 7000 * 1.18 = 8260 fully paid
      },
    });

    assert(resNonOverlap.status === 201, 'Non-overlapping booking on future dates succeeds with 201 Created');
    assert(resNonOverlap.body.data.payment_status === 'PAID', 'Fully paid booking derives payment_status: PAID');
    assert(resNonOverlap.body.data.due_amount === 0, 'Due amount is 0 for fully paid booking');
    createdBookingIds.push(resNonOverlap.body.data.id);

    // =========================================================================
    // 4️⃣ List Bookings & Filtering (GET /api/v1/bookings)
    // =========================================================================
    console.log('\n--- 4. Testing GET /api/v1/bookings (Pagination, Filters, Search) ---');

    const resList = await makeRequest(`/api/v1/bookings?hotel_id=${hotel1Id}`);
    assert(resList.status === 200, 'GET /api/v1/bookings returns 200 OK');
    assert(Array.isArray(resList.body.data.bookings), 'Returns data.bookings array');
    assert(resList.body.data.total >= 2, 'Total bookings count reflects created bookings');
    assert(resList.body.data.page === 1, 'Default page is 1');

    // Filter by room_id
    const resFilterRoom = await makeRequest(`/api/v1/bookings?room_id=${room1Id}`);
    assert(resFilterRoom.status === 200, 'Filter by room_id returns 200 OK');
    assert(
      resFilterRoom.body.data.bookings.some((b) => b.id === booking1.id),
      'Booking allocating room 1 is returned when filtering by room 1'
    );

    // Filter by payment_status
    const resFilterPaid = await makeRequest(`/api/v1/bookings?hotel_id=${hotel1Id}&payment_status=PAID`);
    assert(resFilterPaid.status === 200, 'Filter by payment_status returns 200 OK');
    assert(
      resFilterPaid.body.data.bookings.every((b) => b.payment_status === 'PAID'),
      'All returned bookings have payment_status: PAID'
    );

    // Filter by booking_number
    const resFilterNumber = await makeRequest(`/api/v1/bookings?booking_number=${booking1.booking_number}`);
    assert(resFilterNumber.status === 200, 'Filter by booking_number returns 200 OK');
    assert(resFilterNumber.body.data.bookings.length === 1, 'Returns single matching booking');
    assert(resFilterNumber.body.data.bookings[0].id === booking1.id, 'Returned booking ID matches');

    // Search query
    const resSearch = await makeRequest(`/api/v1/bookings?search=Rahul`);
    assert(resSearch.status === 200, 'Search query returns 200 OK');
    assert(resSearch.body.data.bookings.some((b) => b.primary_guest_name.includes('Rahul')), 'Search finds matching guest name');

    // =========================================================================
    // 5️⃣ Single Booking Details (GET /api/v1/bookings/:id)
    // =========================================================================
    console.log('\n--- 5. Testing GET /api/v1/bookings/:id ---');

    const resGetSingle = await makeRequest(`/api/v1/bookings/${booking1.id}`);
    assert(resGetSingle.status === 200, 'GET /api/v1/bookings/:id returns 200 OK');
    assert(resGetSingle.body.data.id === booking1.id, 'Returned booking ID matches');
    assert(resGetSingle.body.data.hotel.name === 'Booking Test Hotel 1', 'Joined hotel name returned');
    assert(resGetSingle.body.data.room.room_number === '101', 'Joined room number returned');

    const resGet404 = await makeRequest('/api/v1/bookings/999999');
    assert(resGet404.status === 404, 'Returns 404 Not Found for non-existent booking ID');

    // =========================================================================
    // 6️⃣ Update Booking (PUT /api/v1/bookings/:id)
    // =========================================================================
    console.log('\n--- 6. Testing PUT /api/v1/bookings/:id ---');

    const resPut = await makeRequest(`/api/v1/bookings/${booking1.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: {
        primary_guest_name: 'Rahul Sharma (Updated)',
        paid_amount: 12036.00, // Pay in full!
        notes: 'VIP guest - fruit basket provided',
      },
    });

    assert(resPut.status === 200, 'PUT /api/v1/bookings/:id returns 200 OK');
    assert(resPut.body.data.primary_guest_name === 'Rahul Sharma (Updated)', 'Primary guest name updated');
    assert(resPut.body.data.notes === 'VIP guest - fruit basket provided', 'Notes updated');
    assert(resPut.body.data.paid_amount === 12036, 'Paid amount updated to full amount');
    assert(resPut.body.data.due_amount === 0, 'Due amount recalculated to 0');
    assert(resPut.body.data.payment_status === 'PAID', 'Payment status updated to PAID upon full payment');

    // Self-overlap check: Updating dates slightly without collision against other bookings should succeed
    const resSelfOverlap = await makeRequest(`/api/v1/bookings/${booking1.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: {
        check_in_date: '2026-11-01T14:00:00Z',
        check_out_date: '2026-11-03T11:00:00Z', // Reduced to 2 nights
      },
    });
    assert(resSelfOverlap.status === 200, 'Updating booking dates within its own window does not trigger false self-overlap');
    assert(resSelfOverlap.body.data.number_of_nights === 2, 'Number of nights updated to 2');

    // =========================================================================
    // 7️⃣ Soft Deletion & Room Release (DELETE /api/v1/bookings/:id)
    // =========================================================================
    console.log('\n--- 7. Testing DELETE Soft Deletion & Room Reavailability ---');

    const bookingToDelete = resNonOverlap.body.data;
    const resDelete = await makeRequest(`/api/v1/bookings/${bookingToDelete.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${staffToken}` },
    });

    assert(resDelete.status === 200, 'DELETE /api/v1/bookings/:id returns 200 OK');
    assert(resDelete.body.success === true, 'Returns success: true on deletion');

    // Verify soft-deleted in database (deleted_at is set, record not wiped)
    const dbDeleted = await db('bookings').where({ id: bookingToDelete.id }).first();
    assert(Boolean(dbDeleted.deleted_at), 'deleted_at timestamp is populated in MySQL database');

    // GET by ID returns 404
    const resGetDeleted = await makeRequest(`/api/v1/bookings/${bookingToDelete.id}`);
    assert(resGetDeleted.status === 404, 'Soft-deleted booking returns 404 Not Found on GET /:id');

    // GET list excludes soft-deleted booking
    const resListDeleted = await makeRequest(`/api/v1/bookings?hotel_id=${hotel1Id}`);
    assert(
      !resListDeleted.body.data.bookings.some((b) => b.id === bookingToDelete.id),
      'Soft-deleted booking is excluded from GET all bookings list'
    );

    // Re-booking previously colliding dates (2026-11-10 to 2026-11-12) now succeeds because previous booking was soft-deleted!
    const resRebook = await makeRequest('/api/v1/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: {
        hotel_id: hotel1Id,
        primary_guest_name: 'New Guest After Deletion',
        mobile_number: '9988776655',
        room_id: room1Id,
        check_in_date: '2026-11-10T14:00:00Z',
        check_out_date: '2026-11-12T11:00:00Z',
      },
    });

    assert(resRebook.status === 201, 'Soft-deleted booking releases room: new booking on same dates succeeds with 201 Created');
    createdBookingIds.push(resRebook.body.data.id);

    // =========================================================================
    // 8️⃣ Route Prefix Aliases
    // =========================================================================
    console.log('\n--- 8. Testing Route Prefix Aliases ---');

    const resAlias = await makeRequest(`/api/booking?hotel_id=${hotel1Id}`);
    assert(resAlias.status === 200, 'GET /api/booking singular alias returns 200 OK');

    // =========================================================================
    // 9️⃣ Cleanup
    // =========================================================================
    console.log('\n🧹 Cleaning up test database records...');
    await cleanupTestData();
    console.log('  ✅ Cleanup complete');

  } catch (err) {
    console.error('Test execution error:', err);
    failCount++;
  } finally {
    await stopServer();
    await db.destroy();
  }

  console.log('\n========================================');
  console.log(`Test Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('========================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
  process.exit(0);
};

runTests();
