/**
 * Automated Test Suite for Physical Room Module APIs.
 * Tests:
 * 1. POST /api/v1/rooms (Validation, Hotel & Category check, Mismatched Category 400, Uniqueness 409, S3 Images)
 * 2. GET /api/v1/rooms (Pagination & Filters: hotel_id, floor, room_type_id, status, is_active)
 * 3. GET /api/v1/rooms/:id (Single room details, 404 on missing/deleted)
 * 4. PUT /api/v1/rooms/:id (Partial updates, Duplicate room check 409, Image appending)
 * 5. DELETE /api/v1/rooms/:id (Soft-deletion setting deleted_at, excluded from queries)
 * 6. S3 Image Storage in unified images table with room_id
 */
process.env.NODE_ENV = 'test';
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
      if (Buffer.isBuffer(body)) {
        req.write(body);
      } else if (typeof body === 'string') {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
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
    const filename = file.filename || 'room.jpg';
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
let hotel1Token;
let hotel2Token;

const auth = (token, extra = {}) => ({
  Authorization: `Bearer ${token}`,
  ...extra,
});
let roomTypeHotel1Id;
let roomTypeHotel2Id;
const createdRoomIds = [];
const createdRoomTypeIds = [];
const createdHotelIds = [];
const createdUserIds = [];

const setupTestData = async () => {
  // Test User for owner_id
  let testUser = await db('users').where({ email: 'physical_room_owner@test.com' }).first();
  if (!testUser) {
    const [userId] = await db('users').insert({
      name: 'Physical Room Owner',
      email: 'physical_room_owner@test.com',
      password: 'test_password_hash',
      phone: '+919876543220',
      role: 'HOTEL_ADMIN',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    createdUserIds.push(userId);
    testUser = { id: userId };
  }

  // Hotel 1
  let h1 = await db('hotels').where({ slug: 'physical-room-hotel-1' }).first();
  if (!h1) {
    const [id] = await db('hotels').insert({
      name: 'Physical Room Hotel 1',
      slug: 'physical-room-hotel-1',
      owner_id: testUser.id,
      address: '789 Grand Avenue',
      city: 'Bangalore',
      state: 'Karnataka',
      country: 'India',
      pincode: '560001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel1Id = id;
    createdHotelIds.push(id);
  } else {
    hotel1Id = h1.id;
  }

  // Hotel 2
  let h2 = await db('hotels').where({ slug: 'physical-room-hotel-2' }).first();
  if (!h2) {
    const [id] = await db('hotels').insert({
      name: 'Physical Room Hotel 2',
      slug: 'physical-room-hotel-2',
      owner_id: testUser.id,
      address: '101 Tech Park Road',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      pincode: '500001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    hotel2Id = id;
    createdHotelIds.push(id);
  } else {
    hotel2Id = h2.id;
  }

  // Room Type for Hotel 1
  const [rt1Id] = await db('room_types').insert({
    hotel_id: hotel1Id,
    name: `Deluxe Suite ${Date.now()}`,
    description: 'Suite for Hotel 1',
    created_at: new Date(),
    updated_at: new Date(),
  });
  roomTypeHotel1Id = rt1Id;
  createdRoomTypeIds.push(rt1Id);

  // Room Type for Hotel 2
  const [rt2Id] = await db('room_types').insert({
    hotel_id: hotel2Id,
    name: `Executive Room ${Date.now()}`,
    description: 'Executive room for Hotel 2',
    created_at: new Date(),
    updated_at: new Date(),
  });
  roomTypeHotel2Id = rt2Id;
  createdRoomTypeIds.push(rt2Id);

  await db('users').where({ id: testUser.id }).update({
    hotel_id: hotel1Id,
    role: 'HOTEL_ADMIN',
    is_active: true,
  });
  hotel1Token = generateAccessToken(testUser.id, 'HOTEL_ADMIN', hotel1Id);

  let secondUser = await db('users').where({ email: 'physical_room_owner_2@test.com' }).first();
  if (!secondUser) {
    const [userId] = await db('users').insert({
      name: 'Physical Room Owner 2',
      email: 'physical_room_owner_2@test.com',
      password: 'test_password_hash',
      phone: '+919876543221',
      role: 'HOTEL_ADMIN',
      hotel_id: hotel2Id,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    createdUserIds.push(userId);
    secondUser = { id: userId };
  } else {
    await db('users').where({ id: secondUser.id }).update({
      hotel_id: hotel2Id,
      role: 'HOTEL_ADMIN',
      is_active: true,
    });
  }
  hotel2Token = generateAccessToken(secondUser.id, 'HOTEL_ADMIN', hotel2Id);
};

const cleanupTestData = async () => {
  try {
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
  console.log('\n🧪 Starting Physical Room Module Automated Tests...\n');

  try {
    await startServer();
    await setupTestData();

    // -------------------------------------------------------------
    // Test 1: POST /api/v1/rooms Validation Failures
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing POST Validation & Foreign Key Guards ---');

    const emptyRes = await sendRequest('POST', '/api/v1/rooms', {});
    assert(emptyRes.status === 400, 'POST without payload returns 400 Bad Request');
    assert(emptyRes.body.success === false, 'POST without payload returns success: false');

    const missingRoomNumRes = await sendRequest('POST', '/api/v1/rooms', {
      hotel_id: hotel1Id,
      room_type_id: roomTypeHotel1Id,
    });
    assert(missingRoomNumRes.status === 400, 'POST without room_number returns 400 Bad Request');

    const unauthRes = await sendRequest('POST', '/api/v1/rooms', {
      hotel_id: 999999,
      room_type_id: roomTypeHotel1Id,
      room_number: '101',
    });
    assert(unauthRes.status === 401, 'POST without a token returns 401 Unauthorized');

    // Non-existent room type
    const nonExistTypeRes = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        hotel_id: hotel1Id,
        room_type_id: 999999,
        room_number: '101',
      },
      auth(hotel1Token)
    );
    assert(nonExistTypeRes.status === 400, 'POST with non-existent room_type returns 400 Bad Request');

    // Mismatched room type: roomTypeHotel2Id does NOT belong to hotel1Id!
    const mismatchedRes = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        hotel_id: hotel1Id,
        room_type_id: roomTypeHotel2Id,
        room_number: '101',
      },
      auth(hotel1Token)
    );
    assert(mismatchedRes.status === 400, 'POST with mismatched hotel and room_type returns 400 Bad Request');
    assert(mismatchedRes.body.message.includes('belongs to hotel ID'), 'Error explains category belongs to different hotel');

    // -------------------------------------------------------------
    // Test 2: POST /api/v1/rooms (Create Physical Room with S3 Images)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing POST /api/v1/rooms with S3 Images ---');

    const multipart = buildMultipartPayload(
      {
        hotel_id: 999999,
        room_type_id: roomTypeHotel1Id,
        room_number: '101',
        floor: 1,
        status: 'AVAILABLE',
        seating_capacity: 4,
        bed_count: 2,
        bed_type: '2 Queen Beds',
        custom_price_per_night: '4500.00',
        notes: 'Corner room with city view',
        amenities: JSON.stringify(['WiFi', 'Mini Bar', 'Air Conditioning']),
        cleaning_duration_minutes: 20,
      },
      [
        {
          fieldname: 'images',
          filename: 'physical_room_101.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('room 101 image content'),
        },
      ]
    );

    const createRes = await sendRequest(
      'POST',
      '/api/v1/rooms',
      multipart.body,
      auth(hotel1Token, multipart.headers)
    );

    assert(createRes.status === 201, 'POST /api/v1/rooms returns 201 Created');
    assert(createRes.body.success === true, 'POST returns success: true');
    assert(createRes.body.data && createRes.body.data.id, 'POST returns room with numeric ID');
    assert(createRes.body.data.room_number === '101', 'Room number is 101');
    assert(createRes.body.data.floor === 1, 'Floor is 1');
    assert(createRes.body.data.hotel_id === hotel1Id, 'Hotel ID comes from the token, not the body');
    assert(createRes.body.data.room_type_id === roomTypeHotel1Id, 'Room type ID matches');
    assert(createRes.body.data.status === 'AVAILABLE', 'Status is AVAILABLE');
    assert(createRes.body.data.custom_price_per_night === 4500, 'Custom price is 4500');
    assert(Array.isArray(createRes.body.data.amenities), 'Amenities parsed as array');
    assert(createRes.body.data.amenities.length === 3, 'Amenities array has 3 items');
    assert(Array.isArray(createRes.body.data.images), 'Images returned as array of URLs');
    assert(createRes.body.data.images.length === 1, 'Images array contains 1 URL');
    assert(createRes.body.data.images[0].startsWith('http'), 'Image URL is fully qualified');

    const room101Id = createRes.body.data.id;
    createdRoomIds.push(room101Id);

    // Verify stored in unified images table
    const imageRows = await db('images').where({ room_id: room101Id });
    assert(imageRows.length === 1, 'Image record stored in unified images table with room_id');
    assert(imageRows[0].room_type_id === null, 'Unified images table stores room_type_id as null for room image');

    // -------------------------------------------------------------
    // Test 3: Composite Uniqueness Guard (hotel_id, floor, room_number)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Composite Unique Index (hotel_id, floor, room_number) ---');

    // Attempt to create room 101 on floor 1 for hotel1Id again -> Should FAIL with 409!
    const duplicateRes = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        hotel_id: hotel2Id,
        room_type_id: roomTypeHotel1Id,
        room_number: '101',
        floor: 1,
      },
      auth(hotel1Token)
    );
    assert(duplicateRes.status === 409, 'Duplicate room on same hotel and floor returns 409 Conflict');

    // Creating room 101 on DIFFERENT floor (e.g. floor 2) -> Should SUCCEED!
    const floor2Res = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        room_type_id: roomTypeHotel1Id,
        room_number: '101',
        floor: 2,
      },
      auth(hotel1Token)
    );
    assert(floor2Res.status === 201, 'Same room number on different floor (floor 2) returns 201 Created');
    if (floor2Res.body.data?.id) createdRoomIds.push(floor2Res.body.data.id);

    // Creating room 101 on DIFFERENT hotel -> Should SUCCEED!
    const hotel2RoomRes = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        hotel_id: hotel1Id,
        room_type_id: roomTypeHotel2Id,
        room_number: '101',
        floor: 1,
      },
      auth(hotel2Token)
    );
    assert(hotel2RoomRes.status === 201, 'Same room number in different hotel returns 201 Created');
    assert(hotel2RoomRes.body.data?.hotel_id === hotel2Id, 'Body hotel_id is ignored; room is created for the token hotel');
    if (hotel2RoomRes.body.data?.id) createdRoomIds.push(hotel2RoomRes.body.data.id);

    // -------------------------------------------------------------
    // Test 4: GET /api/v1/rooms (Pagination & Filtering)
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing GET /api/v1/rooms List & Filters ---');

    const getAllRes = await sendRequest('GET', '/api/v1/rooms');
    assert(getAllRes.status === 200, 'GET /api/v1/rooms returns 200 OK');
    assert(Array.isArray(getAllRes.body.data.rooms), 'GET returns data.rooms array');
    assert(typeof getAllRes.body.data.total === 'number', 'GET returns data.total count');
    assert(typeof getAllRes.body.data.totalPages === 'number', 'GET returns data.totalPages count');

    // Token hotel wins over a query hotel_id pointing at the other hotel
    const filterHotelRes = await sendRequest(
      'GET',
      `/api/v1/rooms?hotel_id=${hotel2Id}`,
      null,
      auth(hotel1Token)
    );
    assert(filterHotelRes.status === 200, 'GET with a token returns 200 OK');
    assert(
      filterHotelRes.body.data.rooms.every((r) => r.hotel_id === hotel1Id),
      'Query hotel_id is ignored; rooms belong to the token hotel'
    );

    // Filter by floor
    const filterFloorRes = await sendRequest('GET', `/api/v1/rooms?hotel_id=${hotel1Id}&floor=2`);
    assert(filterFloorRes.status === 200, 'GET with floor filter returns 200 OK');
    assert(
      filterFloorRes.body.data.rooms.every((r) => r.floor === 2),
      'All filtered rooms are on floor 2'
    );

    // Filter by status
    const filterStatusRes = await sendRequest('GET', '/api/v1/rooms?status=AVAILABLE');
    assert(filterStatusRes.status === 200, 'GET with status filter returns 200 OK');
    assert(
      filterStatusRes.body.data.rooms.every((r) => r.status === 'AVAILABLE'),
      'All filtered rooms have status AVAILABLE'
    );

    // Pagination limit
    const pageLimitRes = await sendRequest('GET', '/api/v1/rooms?page=1&limit=2');
    assert(pageLimitRes.status === 200, 'GET with pagination returns 200 OK');
    assert(pageLimitRes.body.data.rooms.length <= 2, 'Page limit correctly restricts room results');
    assert(pageLimitRes.body.data.limit === 2, 'Response confirms limit 2');

    // -------------------------------------------------------------
    // Test 5: GET /api/v1/rooms/:id
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing GET /api/v1/rooms/:id ---');

    const getSingleRes = await sendRequest('GET', `/api/v1/rooms/${room101Id}`);
    assert(getSingleRes.status === 200, 'GET /api/v1/rooms/:id returns 200 OK');
    assert(getSingleRes.body.data.id === room101Id, 'Returned room ID matches');
    assert(getSingleRes.body.data.room_number === '101', 'Room number matches');
    assert(Array.isArray(getSingleRes.body.data.images), 'Images formatted as array');
    assert(getSingleRes.body.data.hotel_name === 'Physical Room Hotel 1', 'Joined hotel name returned');
    assert(Boolean(getSingleRes.body.data.room_type_name), 'Joined room category name returned');

    const notFoundRes = await sendRequest('GET', '/api/v1/rooms/999999');
    assert(notFoundRes.status === 404, 'GET non-existent ID returns 404 Not Found');

    // -------------------------------------------------------------
    // Test 6: PUT /api/v1/rooms/:id
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing PUT /api/v1/rooms/:id ---');

    const keepNumberRes = await sendRequest(
      'PUT',
      `/api/v1/rooms/${room101Id}`,
      {
        room_number: '101',
        floor: 1,
        status: 'OCCUPIED',
        custom_price_per_night: 5200,
        notes: 'Guest checked in today',
      },
      auth(hotel1Token)
    );
    assert(keepNumberRes.status === 200, 'PUT keeping the current room number returns 200 OK');

    const updateRes = keepNumberRes;
    assert(updateRes.status === 200, 'PUT /api/v1/rooms/:id returns 200 OK');
    assert(updateRes.body.data.status === 'OCCUPIED', 'Status updated to OCCUPIED');
    assert(updateRes.body.data.custom_price_per_night === 5200, 'Custom price updated to 5200');
    assert(updateRes.body.data.notes === 'Guest checked in today', 'Notes updated');

    const statusRes = await sendRequest(
      'PATCH',
      `/api/v1/rooms/${room101Id}/status`,
      { status: 'blocked' },
      auth(hotel1Token)
    );
    assert(statusRes.status === 200, 'PATCH /api/v1/rooms/:id/status returns 200 OK');
    assert(statusRes.body.data.status === 'BLOCKED', 'Room status is updated to BLOCKED');
    assert(statusRes.body.data.room_number === '101', 'Status update does not change the room number');

    const invalidStatusRes = await sendRequest(
      'PATCH',
      `/api/v1/rooms/${room101Id}/status`,
      { status: 'OUT_OF_SERVICE' },
      auth(hotel1Token)
    );
    assert(invalidStatusRes.status === 400, 'PATCH with an unknown status returns 400 Bad Request');

    const otherHotelStatusRes = await sendRequest(
      'PATCH',
      `/api/v1/rooms/${room101Id}/status`,
      { status: 'AVAILABLE' },
      auth(hotel2Token)
    );
    assert(otherHotelStatusRes.status === 403, 'PATCH status for another hotel returns 403 Forbidden');

    const blockedListRes = await sendRequest(
      'GET',
      '/api/v1/rooms?status=BLOCKED',
      null,
      auth(hotel1Token)
    );
    assert(blockedListRes.status === 200, 'GET with status=BLOCKED returns 200 OK');
    assert(
      blockedListRes.body.data.rooms.some((r) => r.id === room101Id && r.status === 'BLOCKED'),
      'BLOCKED room is returned by the status filter'
    );

    // Append image via multipart
    const putMultipart = buildMultipartPayload(
      { notes: 'Appended second photo' },
      [
        {
          fieldname: 'images',
          filename: 'room_101_view2.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('second photo content'),
        },
      ]
    );

    const putImageRes = await sendRequest(
      'PUT',
      `/api/v1/rooms/${room101Id}`,
      putMultipart.body,
      auth(hotel1Token, putMultipart.headers)
    );
    assert(putImageRes.status === 200, 'PUT with new image upload returns 200 OK');
    assert(putImageRes.body.data.images.length === 1, 'Room old images removed and replaced with new image without duplication');

    // Update with conflicting room number on same floor -> Should FAIL with 409!
    // Try to rename floor2 room to 101 when 101 already exists on floor 2?
    // Let's create room 102 on floor 1, then try to rename 102 to 101:
    const room102Res = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        hotel_id: 999999,
        room_type_id: roomTypeHotel1Id,
        room_number: '102',
        floor: 1,
      },
      auth(hotel1Token)
    );
    const room102Id = room102Res.body.data?.id;
    if (room102Id) createdRoomIds.push(room102Id);

    const renameConflictRes = await sendRequest(
      'PUT',
      `/api/v1/rooms/${room102Id}`,
      {
        room_number: '101',
        floor: 1,
      },
      auth(hotel1Token)
    );
    assert(renameConflictRes.status === 409, 'Renaming room to existing room on same floor returns 409 Conflict');

    // -------------------------------------------------------------
    // Test 7: DELETE /api/v1/rooms/:id (Soft-deletion)
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing DELETE Soft-Deletion ---');

    const deleteRes = await sendRequest('DELETE', `/api/v1/rooms/${room102Id}`, null, auth(hotel1Token));
    assert(deleteRes.status === 200, 'DELETE /api/v1/rooms/:id returns 200 OK');

    // Check DB row directly
    const dbRow = await db('rooms').where({ id: room102Id }).first();
    assert(Boolean(dbRow.deleted_at), 'deleted_at timestamp is populated in MySQL');
    assert(dbRow.is_deleted === undefined, 'is_deleted column removed from rooms table');

    // Excluded from single get
    const getDeletedRes = await sendRequest('GET', `/api/v1/rooms/${room102Id}`);
    assert(getDeletedRes.status === 404, 'Soft-deleted room returns 404 on GET /:id');

    // Excluded from list query
    const listAfterDelete = await sendRequest('GET', `/api/v1/rooms?hotel_id=${hotel1Id}`);
    const stillPresent = listAfterDelete.body.data.rooms.some((r) => r.id === room102Id);
    assert(!stillPresent, 'Soft-deleted room is excluded from GET /api/v1/rooms list query');

    const reuseRes = await sendRequest(
      'POST',
      '/api/v1/rooms',
      {
        room_type_id: roomTypeHotel1Id,
        room_number: '102',
        floor: 1,
      },
      auth(hotel1Token)
    );
    assert(reuseRes.status === 201, 'Soft-deleted room number can be created again on the same floor and hotel');
    if (reuseRes.body.data?.id) createdRoomIds.push(reuseRes.body.data.id);

    console.log(`\n========================================`);
    console.log(`Test Results: ${passCount} Passed, ${failCount} Failed`);
    console.log(`========================================\n`);

    if (failCount > 0) process.exit(1);
  } catch (err) {
    console.error('Unhandled test suite error:', err);
    process.exit(1);
  } finally {
    await cleanupTestData();
    await stopServer();
    process.exit(failCount > 0 ? 1 : 0);
  }
};

runTests();
