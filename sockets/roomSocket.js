/**
 * Live room status for one hotel.
 * Clients join only their own hotel. A user from another hotel never receives these events.
 * Every room:status publish also sends room:status_breakdown and room:category_counts.
 */
const { Server } = require('socket.io');
const { authenticateUser, validateHotelAccess } = require('../middleware/auth');
const dashboardModel = require('../models/dashboardModel');
const roomTypeModel = require('../models/roomTypeModel');
const { getLiveDashboard, defaultDashboardDateRange } = require('../services/dashboardService');
const { DATE_RANGES } = require('../utils/dateRange');
const { ROLE_CODES } = require('../constants');

const ROOM_STATUS_EVENT = 'room:status';
const ROOM_STATUS_BREAKDOWN_EVENT = 'room:status_breakdown';
const ROOM_CATEGORY_COUNTS_EVENT = 'room:category_counts';
const BOOKING_UPDATED_EVENT = 'booking:updated';
const DASHBOARD_UPDATED_EVENT = 'dashboard:updated';
const DASHBOARD_SUBSCRIBE_EVENT = 'dashboard:subscribe';

let io = null;
const dashboardRefreshTimers = new Map();

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
    const handshakeHeaders = { ...(socket.handshake.headers || {}) };
    if (token) {
      handshakeHeaders.authorization = `Bearer ${token}`;
    }

    // Shape enough like an Express request for authenticateUser / getRequestMeta.
    const req = {
      cookies: {},
      headers: handshakeHeaders,
      query: {},
      body: {},
      ip: socket.handshake.address || null,
      socket: { remoteAddress: socket.handshake.address || null },
      get(name) {
        const key = String(name).toLowerCase();
        const value = this.headers[key] ?? this.headers[name];
        if (value == null) return undefined;
        return Array.isArray(value) ? value[0] : value;
      },
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
    socket.data.dashboardDateRange = defaultDashboardDateRange(socket.data.user.role);

    socket.on(DASHBOARD_SUBSCRIBE_EVENT, (payload) => {
      const nextRange = readDashboardDateRange(payload);
      if (nextRange) socket.data.dashboardDateRange = nextRange;
      emitDashboardToSocket(socket).catch((err) => {
        console.error('[RoomSocket] Failed to publish dashboard:', err.message);
      });
    });

    emitDashboardToSocket(socket).catch((err) => {
      console.error('[RoomSocket] Failed to publish dashboard:', err.message);
    });
  });

  return io;
};

/**
 * Tell the hotel's connected clients the current room counts by status.
 * Used by the dashboard so occupancy cards update without polling.
 * @param {number|string} hotelId
 * @returns {Promise<void>}
 */
const publishRoomStatusBreakdown = async (hotelId) => {
  if (!io || !hotelId) return;

  try {
    const roomStatusBreakdown = await dashboardModel.getHotelRoomStatusSummary(hotelId);
    io.to(hotelChannel(hotelId)).emit(ROOM_STATUS_BREAKDOWN_EVENT, {
      hotel_id: Number(hotelId),
      room_status_breakdown: roomStatusBreakdown,
    });
    await publishRoomCategoryCounts(hotelId);
    scheduleHotelDashboard(hotelId);
  } catch (err) {
    console.error('[RoomSocket] Failed to publish room status breakdown:', err.message);
  }
};

/**
 * Tell the hotel's connected clients the category list counts.
 * Same numbers as GET /room-types: each category, then the hotel total.
 * Sent when a room is created, updated, or deleted, and when a stay changes a room's status.
 * @param {number|string} hotelId
 * @returns {Promise<void>}
 */
const publishRoomCategoryCounts = async (hotelId) => {
  if (!io || !hotelId) return;

  try {
    const counts = await roomTypeModel.getHotelRoomCategoryCounts(hotelId);
    io.to(hotelChannel(hotelId)).emit(ROOM_CATEGORY_COUNTS_EVENT, {
      hotel_id: Number(hotelId),
      room_categories: counts.room_categories,
      room_status_summary: counts.room_status_summary,
    });
  } catch (err) {
    console.error('[RoomSocket] Failed to publish room category counts:', err.message);
  }
};

/**
 * Tell the hotel's connected clients that a room status changed.
 * Also publishes the hotel's room_status_breakdown for live dashboard updates.
 * No-op when the socket server is not running.
 * @param {Object|null} room
 * @param {{ includeBreakdown?: boolean }} [options]
 */
const publishRoomStatus = (room, { includeBreakdown = true } = {}) => {
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

  // A multi-room stay publishes one breakdown after every room event.
  if (includeBreakdown) publishRoomStatusBreakdown(room.hotel_id);
};

/**
 * Tell the hotel's connected clients that a booking changed.
 * The payload matches GET /bookings/:id, including payment_history.
 * No-op when the socket server is not running.
 * @param {Object|null} booking
 */
const publishBookingDetail = (booking) => {
  if (!io || !booking || !booking.hotel_id || !booking.id) return;

  io.to(hotelChannel(booking.hotel_id)).emit(BOOKING_UPDATED_EVENT, booking);
};

/**
 * date_range from a dashboard:subscribe payload. Null when it is not a known range.
 * @param {string|Object|null} payload
 * @returns {string|null}
 */
const readDashboardDateRange = (payload) => {
  const value = typeof payload === 'string' ? payload : payload?.date_range;
  const key = String(value || '').trim().toLowerCase();
  return DATE_RANGES.includes(key) ? key : null;
};

/**
 * Push GET /dashboard data to one connected user.
 * @param {import('socket.io').Socket} socket
 * @returns {Promise<void>}
 */
const emitDashboardToSocket = async (socket) => {
  if (!io || !socket?.data?.user?.hotel_id) return;

  const built = await getLiveDashboard({
    role: socket.data.user.role,
    hotelId: socket.data.user.hotel_id,
    dateRange: socket.data.dashboardDateRange,
  });
  if (!built) return;

  socket.emit(DASHBOARD_UPDATED_EVENT, {
    hotel_id: Number(socket.data.user.hotel_id),
    date_range: built.date_range,
    data: built.data,
  });
};

/**
 * Rebuild the dashboard once per role and date range, then send each client its own view.
 * @param {number|string} hotelId
 * @returns {Promise<void>}
 */
const emitHotelDashboards = async (hotelId) => {
  if (!io || !hotelId) return;

  const room = io.sockets.adapter.rooms.get(hotelChannel(hotelId));
  if (!room || room.size === 0) return;

  const groups = new Map();
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket?.data?.user) continue;
    const role = socket.data.user.role;
    const dateRange = socket.data.dashboardDateRange || defaultDashboardDateRange(role);
    const view = role === ROLE_CODES.HOTEL_ADMIN || role === ROLE_CODES.SUPER_ADMIN
      ? role
      : 'front_desk';
    const key = `${view}:${dateRange}`;
    if (!groups.has(key)) groups.set(key, { role, dateRange, sockets: [] });
    groups.get(key).sockets.push(socket);
  }

  await Promise.all([...groups.values()].map(async (group) => {
    const built = await getLiveDashboard({
      role: group.role,
      hotelId,
      dateRange: group.dateRange,
    });
    if (!built) return;

    const payload = {
      hotel_id: Number(hotelId),
      date_range: built.date_range,
      data: built.data,
    };
    for (const socket of group.sockets) socket.emit(DASHBOARD_UPDATED_EVENT, payload);
  }));
};

/**
 * Refresh every connected dashboard for this hotel after the latest write settles.
 * Repeated calls in the same moment share one refresh.
 * @param {number|string} hotelId
 */
const scheduleHotelDashboard = (hotelId) => {
  if (!io || !hotelId) return;
  const key = Number(hotelId);
  if (!Number.isInteger(key) || key <= 0) return;

  const pending = dashboardRefreshTimers.get(key);
  if (pending) clearTimeout(pending);
  dashboardRefreshTimers.set(key, setTimeout(() => {
    dashboardRefreshTimers.delete(key);
    emitHotelDashboards(key).catch((err) => {
      console.error('[RoomSocket] Failed to publish dashboard:', err.message);
    });
  }, 200));
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
  publishRoomStatusBreakdown,
  publishRoomCategoryCounts,
  publishBookingDetail,
  scheduleHotelDashboard,
  disconnectHotel,
  closeRoomSocket,
  ROOM_STATUS_EVENT,
  ROOM_STATUS_BREAKDOWN_EVENT,
  ROOM_CATEGORY_COUNTS_EVENT,
  BOOKING_UPDATED_EVENT,
  DASHBOARD_UPDATED_EVENT,
};
