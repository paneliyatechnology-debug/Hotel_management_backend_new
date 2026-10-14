/**
 * Live room status for one hotel.
 * Clients join only their own hotel. A user from another hotel never receives these events.
 */
const { Server } = require('socket.io');
const { authenticateUser, validateHotelAccess } = require('../middleware/auth');
const { ROLE_CODES } = require('../constants');

const ROOM_STATUS_EVENT = 'room:status';

let io = null;

const hotelChannel = (hotelId) => `hotel:${Number(hotelId)}`;

/**
 * Access token from the Socket.IO auth payload, Authorization header, or accessToken cookie.
 * @param {import('socket.io').Socket} socket
 * @returns {string|null}
 */
const readAccessToken = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) return String(authToken).replace(/^Bearer\s+/i, '').trim();

  const header = socket.handshake.headers?.authorization;
  if (header && header.startsWith('Bearer ')) return header.split(' ')[1].trim();

  const cookie = socket.handshake.headers?.cookie || '';
  const match = cookie.match(/(?:^|;)\s*(?:accessToken|access_token)=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

/**
 * Run one Express auth middleware against a handshake-shaped request.
 * @param {Function} middleware
 * @param {Object} req
 * @returns {Promise<void>}
 */
const runMiddleware = (middleware, req) => new Promise((resolve, reject) => {
  middleware(req, {}, (err) => (err ? reject(err) : resolve()));
});

/**
 * Same login rules as the HTTP APIs. Every hotel role can connect.
 * A user is joined only to the hotel on their account.
 * @param {import('socket.io').Socket} socket
 * @param {(err?: Error) => void} next
 */
const authorizeSocket = async (socket, next) => {
  try {
    const token = readAccessToken(socket);
    const requestedHotelId = socket.handshake.auth?.hotel_id ?? socket.handshake.query?.hotel_id;
    const req = {
      cookies: {},
      headers: token ? { authorization: `Bearer ${token}` } : {},
      query: {},
      body: {},
    };

    if (requestedHotelId !== undefined && requestedHotelId !== null && requestedHotelId !== '') {
      req.query.hotel_id = String(requestedHotelId);
    }

    await runMiddleware(authenticateUser, req);
    await runMiddleware(validateHotelAccess, req);

    let hotelId = Number(req.user.hotel_id);
    if (req.user.role === ROLE_CODES.SUPER_ADMIN) {
      hotelId = Number(req.query.hotel_id);
      if (!Number.isInteger(hotelId) || hotelId <= 0) {
        return next(new Error('hotel_id is required.'));
      }
    }

    socket.data.user = {
      id: req.user.id,
      role: req.user.role,
      hotel_id: hotelId,
    };
    return next();
  } catch (err) {
    return next(err instanceof Error ? err : new Error('Access denied.'));
  }
};

/**
 * Attach the room socket to the HTTP server.
 * @param {import('http').Server} httpServer
 * @param {{ isOriginAllowed: (origin?: string) => boolean }} options
 */
const attachRoomSocket = (httpServer, { isOriginAllowed }) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed.'));
      },
      credentials: true,
    },
  });

  io.use(authorizeSocket);

  io.on('connection', (socket) => {
    const hotelId = socket.data.user.hotel_id;
    socket.join(hotelChannel(hotelId));
  });

  return io;
};

/**
 * Tell the hotel's connected clients that a room status changed.
 * No-op when the socket server is not running.
 * @param {Object|null} room
 */
const publishRoomStatus = (room) => {
  if (!io || !room || !room.hotel_id || !room.id) return;

  io.to(hotelChannel(room.hotel_id)).emit(ROOM_STATUS_EVENT, {
    id: room.id,
    hotel_id: room.hotel_id,
    room_number: room.room_number,
    floor: room.floor,
    status: room.status,
    is_active: Boolean(room.is_active),
    deleted_at: room.deleted_at || null,
    updated_at: room.updated_at,
  });
};

/**
 * Drop every connected client of a hotel. Used when the hotel is deactivated.
 * @param {number|string} hotelId
 */
const disconnectHotel = (hotelId) => {
  if (!io) return;
  io.in(hotelChannel(hotelId)).disconnectSockets(true);
};

const closeRoomSocket = () => {
  if (!io) return;
  io.close();
  io = null;
};

module.exports = {
  attachRoomSocket,
  publishRoomStatus,
  disconnectHotel,
  closeRoomSocket,
};
