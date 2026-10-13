/**
 * Automated Test Suite for Room Category (Room Types) APIs.
 * Tests:
 * 1. GET /api/v1/room-types (Retrieve active room categories, optional hotel_id filter)
 * 2. GET /api/v1/room-types/:id (Single room category, 404 on missing, invalid ID check)
 * 3. POST /api/v1/room-types (Create with hotel_id, name, description, images[], uniqueness enforcement)
 * 4. PUT /api/v1/room-types/:id (Update name/description, duplicate name conflict 409)
 * 5. DELETE /api/v1/room-types/:id (Physical room assignment check, safe deletion)
 * 6. S3 Image Storage & Array URL formatting verification
 */
process.env.NODE_ENV = 'test';
const http = require('http');
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

/**
 * Build multipart/form-data payload with boundary
 */
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
      : Buffer.from(file.content || 'fake image content');

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

let testHotelId;
let secondHotelId;
const createdRoomTypeIds = [];
const createdHotelIds = [];
const createdUserIds = [];

const setupTestData = async () => {
  // Create a test user for owner_id
  let testUser = await db('users').where({ email: 'test_hotel_owner_1@test.com' }).first();
  if (!testUser) {
    const [userId] = await db('users').insert({
      name: 'Test Owner',
      email: 'test_hotel_owner_1@test.com',
      password: 'hashed_password_123',
      phone: '+919876543210',
      role: 'HOTEL_ADMIN',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
    createdUserIds.push(userId);
    testUser = { id: userId };
  }

  // Ensure a test hotel exists in database
  let hotel = await db('hotels').where({ slug: 'test-room-hotel-1' }).first();
  if (!hotel) {
    const [id] = await db('hotels').insert({
      name: 'Test Room Category Hotel 1',
      slug: 'test-room-hotel-1',
      owner_id: testUser.id,
      address: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      pincode: '400001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    testHotelId = id;
    createdHotelIds.push(id);
  } else {
    testHotelId = hotel.id;
  }

  // Ensure a second hotel exists for scoped testing
  let hotel2 = await db('hotels').where({ slug: 'test-room-hotel-2' }).first();
  if (!hotel2) {
    const [id] = await db('hotels').insert({
      name: 'Test Room Category Hotel 2',
      slug: 'test-room-hotel-2',
      owner_id: testUser.id,
      address: '456 Test Road',
      city: 'Delhi',
      state: 'Delhi',
      country: 'India',
      pincode: '110001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    secondHotelId = id;
    createdHotelIds.push(id);
  } else {
    secondHotelId = hotel2.id;
  }
};

const cleanupTestData = async () => {
  try {
    if (createdRoomTypeIds.length > 0) {
      await db('rooms').whereIn('room_type_id', createdRoomTypeIds).del();
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
  console.log('\n🧪 Starting Room Category (Room Types) API Automated Tests...\n');

  try {
    await startServer();
    await setupTestData();

    // -------------------------------------------------------------
    // Test 1: POST /api/v1/room-types Validation Failures
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing POST Validation Failures ---');

    const emptyRes = await sendRequest('POST', '/api/v1/room-types', {});
    assert(emptyRes.status === 400, 'POST without fields returns 400 Bad Request');
    assert(emptyRes.body.success === false, 'POST without fields returns success: false');

    const missingNameRes = await sendRequest('POST', '/api/v1/room-types', {
      hotel_id: testHotelId,
    });
    assert(missingNameRes.status === 400, 'POST with missing name returns 400 Bad Request');

    const invalidHotelRes = await sendRequest('POST', '/api/v1/room-types', {
      hotel_id: 9999999,
      name: 'Ghost Hotel Room',
    });
    assert(invalidHotelRes.status === 404, 'POST with non-existent hotel_id returns 404 Not Found');

    // -------------------------------------------------------------
    // Test 2: POST /api/v1/room-types (Multipart with images and S3)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing POST /api/v1/room-types with S3 Images ---');

    const deluxeName = `Deluxe Ocean View ${Date.now()}`;
    const multipartData = buildMultipartPayload(
      {
        hotel_id: testHotelId,
        name: deluxeName,
        description: 'Luxurious room overlooking the ocean',
      },
      [
        {
          fieldname: 'images',
          filename: 'ocean_view_1.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('fake image content 1'),
        },
        {
          fieldname: 'images',
          filename: 'ocean_view_2.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('fake image content 2'),
        },
      ]
    );

    const createRes = await sendRequest(
      'POST',
      '/api/v1/room-types',
      multipartData.body,
      multipartData.headers
    );

    assert(createRes.status === 201, 'POST /api/v1/room-types returns 201 Created');
    assert(createRes.body.success === true, 'POST response has success: true');
    assert(createRes.body.data && createRes.body.data.id, 'POST response returns created category with ID');
    assert(createRes.body.data.name === deluxeName, 'POST response returns correct category name');
    assert(createRes.body.data.hotel_id === testHotelId, 'POST response returns correct hotel_id');
    assert(createRes.body.data.description === 'Luxurious room overlooking the ocean', 'POST response returns description');
    assert(Array.isArray(createRes.body.data.images), 'POST response returns images as an array');
    assert(createRes.body.data.images.length === 2, 'POST response returns 2 uploaded image URLs');
    assert(
      createRes.body.data.images.every((url) => url.startsWith('http://') || url.startsWith('https://')),
      'All image URLs are fully qualified URLs'
    );

    const deluxeId = createRes.body.data.id;
    createdRoomTypeIds.push(deluxeId);

    assert(createRes.body.data.is_active === undefined, 'Category response does not contain is_active');
    assert(createRes.body.data.is_deleted === undefined, 'Category response does not contain is_deleted');

    // Verify relational images table
    const storedImages = await db('images').where({ room_type_id: deluxeId });
    assert(storedImages.length === 2, 'Images are stored in relational images table');
    assert(storedImages[0].image_name || storedImages[0].s3_key, 'Relational table stores image file name / key');

    // -------------------------------------------------------------
    // Test 3: POST duplicate category name in same hotel (409 Conflict)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Duplicate Name Enforcement ---');

    const duplicateRes = await sendRequest('POST', '/api/v1/room-types', {
      hotel_id: testHotelId,
      name: deluxeName.toLowerCase(), // case-insensitive duplicate check
      description: 'Another duplicate attempt',
    });
    assert(duplicateRes.status === 409, 'POST with duplicate name in same hotel returns 409 Conflict');

    // But same name in DIFFERENT hotel is permitted!
    const diffHotelRes = await sendRequest('POST', '/api/v1/room-types', {
      hotel_id: secondHotelId,
      name: deluxeName,
      description: 'Same name in second hotel is valid',
    });
    assert(diffHotelRes.status === 201, 'POST same name in a different hotel returns 201 Created');
    if (diffHotelRes.body.data?.id) {
      createdRoomTypeIds.push(diffHotelRes.body.data.id);
    }

    // -------------------------------------------------------------
    // Test 4: GET /api/v1/room-types
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing GET /api/v1/room-types ---');

    const getAllRes = await sendRequest('GET', '/api/v1/room-types');
    assert(getAllRes.status === 200, 'GET /api/v1/room-types returns 200 OK');
    assert(Array.isArray(getAllRes.body.data), 'GET returns array of room categories');
    const foundDeluxe = getAllRes.body.data.find((item) => item.id === deluxeId);
    assert(Boolean(foundDeluxe), 'Created room category is present in GET all list');
    assert(Array.isArray(foundDeluxe.images) && foundDeluxe.images.length === 2, 'Images in GET all list are formatted as array of URLs');

    // Filter by hotel_id
    const filterRes = await sendRequest('GET', `/api/v1/room-types?hotel_id=${testHotelId}`);
    assert(filterRes.status === 200, 'GET with hotel_id query filter returns 200 OK');
    assert(
      filterRes.body.data.every((r) => r.hotel_id === testHotelId),
      'All returned categories belong to the requested hotel_id'
    );

    // -------------------------------------------------------------
    // Test 5: GET /api/v1/room-types/:id
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing GET /api/v1/room-types/:id ---');

    const getSingleRes = await sendRequest('GET', `/api/v1/room-types/${deluxeId}`);
    assert(getSingleRes.status === 200, 'GET /api/v1/room-types/:id returns 200 OK');
    assert(getSingleRes.body.data.id === deluxeId, 'GET returns exact room category requested');
    assert(Array.isArray(getSingleRes.body.data.images), 'GET returns images as array');
    assert(getSingleRes.body.data.images.length === 2, 'GET returns 2 image URLs');

    const notFoundRes = await sendRequest('GET', '/api/v1/room-types/9999999');
    assert(notFoundRes.status === 404, 'GET with non-existent ID returns 404 Not Found');

    const invalidIdRes = await sendRequest('GET', '/api/v1/room-types/abc');
    assert(invalidIdRes.status === 400, 'GET with invalid non-numeric ID returns 400 Bad Request');

    // -------------------------------------------------------------
    // Test 6: PUT /api/v1/room-types/:id
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing PUT /api/v1/room-types/:id ---');

    const updatedName = `${deluxeName} - Premium Renovated`;
    const updateRes = await sendRequest('PUT', `/api/v1/room-types/${deluxeId}`, {
      name: updatedName,
      description: 'Updated premium description',
    });
    assert(updateRes.status === 200, 'PUT /api/v1/room-types/:id returns 200 OK');
    assert(updateRes.body.data.name === updatedName, 'PUT successfully updates category name');
    assert(updateRes.body.data.description === 'Updated premium description', 'PUT successfully updates description');

    // Update with new image upload via multipart
    const putMultipart = buildMultipartPayload(
      {
        description: 'Now with a third balcony image',
      },
      [
        {
          fieldname: 'images',
          filename: 'balcony_view.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('fake balcony image'),
        },
      ]
    );

    const putImageRes = await sendRequest(
      'PUT',
      `/api/v1/room-types/${deluxeId}`,
      putMultipart.body,
      putMultipart.headers
    );
    assert(putImageRes.status === 200, 'PUT with multipart new image returns 200 OK');
    assert(putImageRes.body.data.images.length === 1, 'Category old images removed and replaced with new image without duplication');

    // -------------------------------------------------------------
    // Test 7: DELETE /api/v1/room-types/:id (Safe Deletion Check)
    // -------------------------------------------------------------
    console.log('\n--- 7. Testing DELETE Safe Physical Room Assignment Check ---');

    // Create a physical room assigned to this category
    const [roomId] = await db('rooms').insert({
      hotel_id: testHotelId,
      room_number: `RM-${Date.now()}`,
      room_type_id: deluxeId,
      status: 'AVAILABLE',
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Attempt to delete category when physical room is assigned -> Should FAIL!
    const blockedDeleteRes = await sendRequest('DELETE', `/api/v1/room-types/${deluxeId}`);
    assert(
      blockedDeleteRes.status === 400,
      'DELETE is safely blocked with 400 Bad Request when physical rooms are assigned'
    );
    assert(
      blockedDeleteRes.body.message.includes('physical room'),
      'Blocked deletion error message explicitly mentions physical rooms'
    );

    // Now remove the physical room
    await db('rooms').where({ id: roomId }).del();

    // Now attempt deletion again -> Should SUCCEED!
    const successDeleteRes = await sendRequest('DELETE', `/api/v1/room-types/${deluxeId}`);
    assert(successDeleteRes.status === 200, 'DELETE succeeds with 200 OK when no physical rooms are assigned');

    // Verify it is excluded from active GET queries
    const getAfterDelete = await sendRequest('GET', `/api/v1/room-types/${deluxeId}`);
    assert(getAfterDelete.status === 404, 'Deleted category is no longer returned by GET /api/v1/room-types/:id');

    const getAllAfterDelete = await sendRequest('GET', '/api/v1/room-types');
    const stillPresent = getAllAfterDelete.body.data.some((r) => r.id === deluxeId);
    assert(!stillPresent, 'Deleted category is omitted from GET all active room types');

    // -------------------------------------------------------------
    // Test 8: Route Aliases (/api/room-types)
    // -------------------------------------------------------------
    console.log('\n--- 8. Testing Route Prefix Aliases ---');

    const aliasRes = await sendRequest('GET', '/api/room-types');
    assert(aliasRes.status === 200, 'GET /api/room-types alias returns 200 OK');

    console.log(`\n========================================`);
    console.log(`Test Results: ${passCount} Passed, ${failCount} Failed`);
    console.log(`========================================\n`);

    if (failCount > 0) {
      process.exit(1);
    }
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
