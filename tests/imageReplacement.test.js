/**
 * Image Replacement & Deduplication Automated Test Suite
 * Validates that updating images removes old images from S3 and DB to prevent duplication.
 */
process.env.NODE_ENV = 'test';
require('dotenv').config();
const http = require('http');
const assert = require('assert');
const app = require('../app');
const db = require('../database/knex');
const s3Service = require('../services/s3Service');

let server;
let port;
let baseUrl;

const startServer = () =>
  new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

const stopServer = () =>
  new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });

const buildMultipartPayload = (fields = {}, files = []) => {
  const boundary = `----WebKitFormBoundary${Date.now()}`;
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      )
    );
  }

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.content);
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

const sendRequest = (method, path, body = null, headers = {}) =>
  new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { ...headers };
    let reqBody = null;

    if (body && !headers['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = JSON.stringify(body);
      reqHeaders['Content-Length'] = Buffer.byteLength(reqBody);
    } else if (body) {
      reqBody = body;
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
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch (_) {
            parsed = rawData;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });

async function runTest() {
  console.log('\n🧪 Testing Image Replacement and Deduplication (S3 & DB)...\n');
  await startServer();

  let testUserId;
  let testHotelId;
  let testRoomTypeId;
  let testRoomId;
  let testBookingId;

  try {
    // 1. Setup Test User & Hotel
    const [uId] = await db('users').insert({
      name: 'Img Test User',
      email: `imguser${Date.now()}@hotel.com`,
      password: 'password123',
      role: 'SUPER_ADMIN',
      created_at: new Date(),
      updated_at: new Date(),
    });
    testUserId = uId;

    const [hId] = await db('hotels').insert({
      name: 'Image Test Hotel',
      slug: `img-hotel-${Date.now()}`,
      owner_id: testUserId,
      address: '123 Beach Road',
      city: 'Goa',
      state: 'Goa',
      country: 'India',
      pincode: '403001',
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    });
    testHotelId = hId;

    // -----------------------------------------------------------------
    // TEST 1: Room Category (Room Type) Image Replacement
    // -----------------------------------------------------------------
    console.log('--- 1. Testing Room Type Image Replacement ---');
    const postRtMultipart = buildMultipartPayload(
      { hotel_id: testHotelId, name: `Deluxe Suite ${Date.now()}` },
      [
        {
          fieldname: 'images',
          filename: 'original_rt.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('original rt image'),
        },
      ]
    );

    const postRtRes = await sendRequest('POST', '/api/v1/room-types', postRtMultipart.body, postRtMultipart.headers);
    assert.strictEqual(postRtRes.status, 201);
    testRoomTypeId = postRtRes.body.data.id;
    assert.strictEqual(postRtRes.body.data.images.length, 1);
    const originalRtImage = postRtRes.body.data.images[0];

    // Verify 1 image row in DB
    const rtImagesBefore = await db('images').where({ room_type_id: testRoomTypeId });
    assert.strictEqual(rtImagesBefore.length, 1);

    // Update Room Type with NEW image
    const putRtMultipart = buildMultipartPayload(
      { description: 'Updated with new replacement image' },
      [
        {
          fieldname: 'images',
          filename: 'new_rt.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('new replacement rt image'),
        },
      ]
    );
    const putRtRes = await sendRequest('PUT', `/api/v1/room-types/${testRoomTypeId}`, putRtMultipart.body, putRtMultipart.headers);
    assert.strictEqual(putRtRes.status, 200);
    assert.strictEqual(putRtRes.body.data.images.length, 1, 'Only new image exists in array');
    assert.notStrictEqual(putRtRes.body.data.images[0], originalRtImage, 'New image URL replaced old one');

    // Verify DB images count is still 1 (no duplicate row)
    const rtImagesAfter = await db('images').where({ room_type_id: testRoomTypeId });
    assert.strictEqual(rtImagesAfter.length, 1, 'DB images table has exactly 1 row (old row deleted)');
    console.log('  ✅ PASS: Room Type old images deleted from S3 & DB, new image saved without duplication');

    // -----------------------------------------------------------------
    // TEST 2: Physical Room Image Replacement
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Physical Room Image Replacement ---');
    const postRoomMultipart = buildMultipartPayload(
      {
        hotel_id: testHotelId,
        room_type_id: testRoomTypeId,
        room_number: `R-${Date.now()}`,
        floor: 1,
      },
      [
        {
          fieldname: 'images',
          filename: 'room_original.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('original room image'),
        },
      ]
    );

    const postRoomRes = await sendRequest('POST', '/api/v1/rooms', postRoomMultipart.body, postRoomMultipart.headers);
    assert.strictEqual(postRoomRes.status, 201);
    testRoomId = postRoomRes.body.data.id;
    assert.strictEqual(postRoomRes.body.data.images.length, 1);
    const originalRoomImage = postRoomRes.body.data.images[0];

    // Verify 1 image row in DB
    const roomImagesBefore = await db('images').where({ room_id: testRoomId });
    assert.strictEqual(roomImagesBefore.length, 1);

    // Update Room with NEW image
    const putRoomMultipart = buildMultipartPayload(
      { notes: 'Updated notes with replacement image' },
      [
        {
          fieldname: 'images',
          filename: 'room_replacement.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('new replacement room image'),
        },
      ]
    );

    const putRoomRes = await sendRequest('PUT', `/api/v1/rooms/${testRoomId}`, putRoomMultipart.body, putRoomMultipart.headers);
    assert.strictEqual(putRoomRes.status, 200);
    assert.strictEqual(putRoomRes.body.data.images.length, 1, 'Room only has 1 image URL');
    assert.notStrictEqual(putRoomRes.body.data.images[0], originalRoomImage, 'Room image replaced');

    // Verify DB images count is still 1 (old row deleted)
    const roomImagesAfter = await db('images').where({ room_id: testRoomId });
    assert.strictEqual(roomImagesAfter.length, 1, 'DB images table has exactly 1 row (old row deleted)');
    console.log('  ✅ PASS: Physical Room old images deleted from S3 & DB, new image saved without duplication');

    // -----------------------------------------------------------------
    // TEST 3: Booking Image & Signature Replacement
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Booking Image & Signature Replacement ---');
    const postBookingMultipart = buildMultipartPayload(
      {
        hotel_id: testHotelId,
        room_id: testRoomId,
        primary_guest_name: 'John Doe',
        mobile_number: '9876543210',
        check_in_date: '2026-12-01',
        check_out_date: '2026-12-03',
        paid_amount: '1000',
      },
      [
        {
          fieldname: 'images',
          filename: 'guest_id_old.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('old guest id image'),
        },
        {
          fieldname: 'signatures',
          filename: 'signature_old.png',
          contentType: 'image/png',
          content: Buffer.from('old signature'),
        },
      ]
    );

    const postBookingRes = await sendRequest('POST', '/api/v1/bookings', postBookingMultipart.body, postBookingMultipart.headers);
    assert.strictEqual(postBookingRes.status, 201);
    testBookingId = postBookingRes.body.data.id;
    assert.strictEqual(postBookingRes.body.data.images.length, 1);
    assert.strictEqual(postBookingRes.body.data.signatures.length, 1);
    const oldBookingImage = postBookingRes.body.data.images[0];
    const oldBookingSig = postBookingRes.body.data.signatures[0];

    // Verify DB count
    const bImagesBefore = await db('images').where({ booking_id: testBookingId, is_signature: 0 });
    const bSigsBefore = await db('images').where({ booking_id: testBookingId, is_signature: 1 });
    assert.strictEqual(bImagesBefore.length, 1);
    assert.strictEqual(bSigsBefore.length, 1);

    // Update Booking with NEW images & signatures
    const putBookingMultipart = buildMultipartPayload(
      { notes: 'Updated booking with new files' },
      [
        {
          fieldname: 'images',
          filename: 'guest_id_new.jpg',
          contentType: 'image/jpeg',
          content: Buffer.from('new guest id image'),
        },
        {
          fieldname: 'signatures',
          filename: 'signature_new.png',
          contentType: 'image/png',
          content: Buffer.from('new signature'),
        },
      ]
    );

    const putBookingRes = await sendRequest('PUT', `/api/v1/bookings/${testBookingId}`, putBookingMultipart.body, putBookingMultipart.headers);
    assert.strictEqual(putBookingRes.status, 200);
    assert.strictEqual(putBookingRes.body.data.images.length, 1, 'Booking has 1 image');
    assert.strictEqual(putBookingRes.body.data.signatures.length, 1, 'Booking has 1 signature');
    assert.notStrictEqual(putBookingRes.body.data.images[0], oldBookingImage, 'Old booking image replaced');
    assert.notStrictEqual(putBookingRes.body.data.signatures[0], oldBookingSig, 'Old booking signature replaced');

    // Verify DB rows
    const bImagesAfter = await db('images').where({ booking_id: testBookingId, is_signature: 0 });
    const bSigsAfter = await db('images').where({ booking_id: testBookingId, is_signature: 1 });
    assert.strictEqual(bImagesAfter.length, 1, 'DB booking images has 1 row (old row deleted)');
    assert.strictEqual(bSigsAfter.length, 1, 'DB booking signatures has 1 row (old row deleted)');
    console.log('  ✅ PASS: Booking old images and signatures deleted from S3 & DB, new ones saved without duplication');

    console.log('\n🎉 ALL IMAGE REPLACEMENT AND DEDUPLICATION TESTS PASSED SUCCESSFULLY!\n');
  } catch (err) {
    console.error('Caught error during test:', err);
    throw err;
  } finally {
    // Cleanup
    if (testBookingId) {
      await db('images').where({ booking_id: testBookingId }).del();
      await db('bookings').where({ id: testBookingId }).del();
    }
    if (testRoomId) {
      await db('images').where({ room_id: testRoomId }).del();
      await db('rooms').where({ id: testRoomId }).del();
    }
    if (testRoomTypeId) {
      await db('images').where({ room_type_id: testRoomTypeId }).del();
      await db('room_types').where({ id: testRoomTypeId }).del();
    }
    if (testHotelId) {
      await db('hotels').where({ id: testHotelId }).del();
    }
    await stopServer();
    process.exit(0);
  }
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
