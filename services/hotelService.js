/**
 * Hotel service handling business logic, user provisioning,
 * trial calculation, slug generation, and email queuing.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/knex');
const hotelModel = require('../models/hotelModel');
const bookingModel = require('../models/bookingModel');
const userModel = require('../models/userModel');
const tokenModel = require('../models/tokenModel');
const systemSettingsModel = require('../models/systemSettingsModel');
const subscriptionPlanModel = require('../models/subscriptionPlanModel');
const s3Service = require('./s3Service');
const auditService = require('./auditService');
const { checkEmailExistsGlobally } = require('../utils/emailValidator');
const { queueEmail } = require('../queues/emailQueue');
const { disconnectHotel } = require('../sockets/roomSocket');
const {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} = require('../utils/jwt');
const { generateSecureTempPassword } = require('../utils/password');
const { AppError } = require('../utils/response');
const { HTTP_STATUS, AUDIT_ACTIONS, AUDIT_ENTITIES } = require('../constants');

// Bank details printed on bills and folios. Every one is optional.
const BANK_FIELDS = [
  'bank_name',
  'bank_account_holder',
  'bank_account_number',
  'bank_ifsc_code',
  'bank_branch',
];

/**
 * Trim a bank detail. The IFSC code is stored uppercase.
 * @param {string} field - One of BANK_FIELDS
 * @param {*} value
 * @returns {string}
 */
const cleanBankValue = (field, value) => {
  const text = String(value ?? '').trim();
  return field === 'bank_ifsc_code' ? text.toUpperCase() : text;
};

/**
 * Generate a clean, URL-safe slug from hotel name with collision handling.
 * @param {string} name - Hotel name
 * @returns {Promise<string>} Unique slug
 */
const generateUniqueHotelSlug = async (name) => {
  const baseSlug = (name || 'hotel')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'hotel';

  let candidate = baseSlug;
  let exists = await hotelModel.slugExists(candidate);

  if (!exists) {
    return candidate;
  }

  // Handle collision: append random 4-digit suffix
  for (let attempt = 0; attempt < 10; attempt++) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    candidate = `${baseSlug}-${randomSuffix}`;
    exists = await hotelModel.slugExists(candidate);
    if (!exists) {
      return candidate;
    }
  }

  // Final fallback with timestamp
  return `${baseSlug}-${Date.now().toString(36)}`;
};

/**
 * Calculate Trial Start and End dates from SystemSettings
 * @param {Object} settings
 * @returns {{ trialStartDate: Date, trialEndDate: Date, duration: number, unit: string }}
 */
const calculateTrialDates = (settings) => {
  const trialStartDate = new Date();
  const duration = Number(settings?.free_trial_value) || 30;
  const unit = settings?.free_trial_unit === 'hours' ? 'hours' : 'days';

  let trialEndDate;
  if (unit === 'hours') {
    trialEndDate = new Date(trialStartDate.getTime() + duration * 60 * 60 * 1000);
  } else {
    trialEndDate = new Date(trialStartDate.getTime() + duration * 24 * 60 * 60 * 1000);
  }

  return {
    trialStartDate,
    trialEndDate,
    duration,
    unit,
  };
};

/**
 * Upload the hotel logo when the request carries one.
 * The logo arrives only as a form-data file named logo, logo_image or file.
 * @param {Array<Object>|Object} files - Files from multer
 * @returns {Promise<string|null>} Public logo URL, or null when no logo was sent
 */
const uploadHotelLogo = async (files) => {
  const logoFile = Array.isArray(files)
    ? files.find((f) => f.fieldname === 'logo' || f.fieldname === 'logo_image' || f.fieldname === 'file')
    : (files && (files.logo?.[0] || files.logo_image?.[0] || files.file?.[0]));

  if (!logoFile || !logoFile.buffer) return null;

  try {
    const uploadResult = await s3Service.uploadFile(logoFile, 'hotels/logos');
    return uploadResult?.imageUrl || null;
  } catch (s3Error) {
    throw new AppError(
      `Failed to upload hotel logo to S3: ${s3Error.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * Register a new hotel and provision hotel administrator account.
 *
 * @param {Object} payload - Registration body
 * @param {import('express').Response} [res] - Optional Express response for HTTP-only cookies
 * @param {Array<Object>} [files=[]] - Uploaded files (logo)
 * @param {Object} [actor=null] - Super admin creating the hotel. For public registration it carries only
 *   request_meta, and the new hotel admin is recorded as the actor.
 * @returns {Promise<Object>} Safe response data
 */
const registerHotel = async (payload, res = null, files = [], actor = null) => {
  const name = (payload.name || '').trim();
  const ownerName = (payload.owner_name || '').trim();
  const ownerEmail = (payload.owner_email || '').trim();
  const ownerPhone = (payload.owner_phone || '').trim();
  const address = payload.address;
  const city = payload.city;
  const state = payload.state;
  const country = payload.country;
  const pincode = payload.pincode;
  const gstNumber = (payload.gst_number || '').trim();
  const panNumber = (payload.pan_number || '').trim();
  const totalRooms = payload.total_rooms !== undefined ? payload.total_rooms : 0;
  const hotelType = payload.hotel_type;
  const website = payload.website;
  const password = payload.password;

  const uploadedLogoUrl = await uploadHotelLogo(files);

  // 1. Normalize Inputs
  const normalizedEmail = (ownerEmail || '').toLowerCase().trim();
  const cleanPhone = String(ownerPhone || '')
    .replace(/^(\+91|0)/, '')
    .replace(/[\s-]/g, '')
    .trim();

  // 2. Initial Global Email Uniqueness Guard
  const emailExists = await checkEmailExistsGlobally(normalizedEmail);
  if (emailExists) {
    throw new AppError(
      'This email is already registered in the system (either as a user or another hotel owner). Please use a different email.',
      HTTP_STATUS.CONFLICT
    );
  }
  if (await bookingModel.emailUsedOnBooking(normalizedEmail)) {
    throw new AppError('This email is used on a booking.', HTTP_STATUS.CONFLICT);
  }

  // 3. Free Trial Duration Calculation
  const systemSettings = await systemSettingsModel.getSettings();
  const { trialStartDate, trialEndDate, duration, unit } = calculateTrialDates(systemSettings);

  // 4. Secure Temporary Password & Setup Token Generation (Temp Password Flow)
  const rawTempPassword = generateSecureTempPassword();
  const setupToken = crypto.randomBytes(32).toString('hex');
  const setupTokenExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48-hour validity
  const hashedPassword = await bcrypt.hash(rawTempPassword, 10);

  // 5. Database Execution
  let createdHotel = null;
  let createdAdminUser = null;
  let isNewUserCreated = false;

  try {
    // Generate unique slug
    const cleanSlug = await generateUniqueHotelSlug(name);

    // 1. Create or link Hotel Admin user account first to establish owner_id
    const existingUser = await userModel.findUserByEmail(normalizedEmail);
    if (!existingUser) {
      createdAdminUser = await userModel.createUser({
        name: ownerName.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: cleanPhone,
        role: 'HOTEL_ADMIN',
        is_active: true,
        must_change_password: true,
        failed_login_attempts: 0,
      });
      isNewUserCreated = true;
    } else {
      await userModel.updateUser(existingUser.id, {
        name: ownerName.trim(),
        password: hashedPassword,
        phone: cleanPhone,
        role: 'HOTEL_ADMIN',
        is_active: true,
        must_change_password: true,
        failed_login_attempts: 0,
        account_locked_until: null,
      });
      createdAdminUser = await userModel.findUserById(existingUser.id);
    }

    // 2. Create Hotel record referencing owner_id (duplicate owner_name, owner_email, owner_phone removed)
    // Find trial plan and set as default plan, ensuring it is active
    let finalPlanId = payload.subscription_plan_id || payload.subscriptionPlanId || null;
    if (!finalPlanId) {
      let trialPlan = await db('subscription_plans')
        .whereNull('deleted_at')
        .andWhere((qb) => {
          qb.where('code', 'like', '%TRIAL%')
            .orWhere('name', 'like', '%Trial%')
            .orWhere('price', 0);
        })
        .first();

      if (!trialPlan) {
        trialPlan = await db('subscription_plans')
          .where('code', 'like', '%TRIAL%')
          .orWhere('name', 'like', '%Trial%')
          .first();
      }

      if (trialPlan) {
        if (!trialPlan.is_active || trialPlan.deleted_at) {
          await db('subscription_plans')
            .where({ id: trialPlan.id })
            .update({ is_active: true, deleted_at: null, updated_at: new Date() });
        }
        finalPlanId = trialPlan.id;
      } else {
        const [newTrialId] = await db('subscription_plans').insert({
          name: 'Free Trial',
          code: 'TRIAL',
          billing_cycle: 'MONTHLY',
          price: 0.00,
          discount_percent: 0.00,
          max_rooms: 50,
          description: '30-Day Free Trial plan for newly registered hotels.',
          badge: 'FREE TRIAL',
          is_popular: false,
          is_active: true,
          display_order: 0,
          created_at: new Date(),
          updated_at: new Date(),
        });
        finalPlanId = newTrialId;
      }
    } else {
      finalPlanId = Number(finalPlanId);
    }

    const finalPlanActive =
      payload.subscription_plan_active !== undefined
        ? Boolean(payload.subscription_plan_active)
        : payload.subscription_plan_status !== undefined
          ? Boolean(payload.subscription_plan_status)
          : true;

    const finalStartDate = payload.subscription_plan_start_date
      ? new Date(payload.subscription_plan_start_date)
      : trialStartDate;

    const finalEndDate = payload.subscription_plan_end_date
      ? new Date(payload.subscription_plan_end_date)
      : trialEndDate;

    const hotelData = {
      name: name.trim(),
      slug: cleanSlug,
      owner_id: createdAdminUser.id,
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      country: (country || 'India').trim(),
      pincode: String(pincode).trim(),
      gst_number: gstNumber ? gstNumber.trim().toUpperCase() : '',
      pan_number: panNumber ? panNumber.trim().toUpperCase() : '',
      ...Object.fromEntries(BANK_FIELDS.map((field) => [field, cleanBankValue(field, payload[field])])),
      total_rooms: totalRooms ? Number(totalRooms) : 0,
      hotel_type: hotelType ? hotelType.trim() : 'Boutique Hotel',
      website: website ? website.trim() : '',
      logo: uploadedLogoUrl || null,
      is_active: true,
      subscription_plan_id: finalPlanId,
      subscription_plan_active: finalPlanActive,
      subscription_plan_start_date: finalStartDate,
      subscription_plan_end_date: finalEndDate,
      auto_renew: false,
      check_in_time: '14:00',
      check_out_time: '12:00',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      tax_percentage: 18.00,
      gst_enabled: Boolean(gstNumber),
      upi_id: payload.upi_id || null,
      late_checkout_grace_minutes: 10,
      amenities: JSON.stringify(['Free WiFi', '24/7 Room Service', 'Air Conditioning']),
      policies: JSON.stringify([
        'Valid Government ID required at check-in',
        'No smoking in standard rooms',
      ]),
    };

    createdHotel = await hotelModel.createHotel(hotelData);

    // 3. Link hotel_id to the created admin user record
    await userModel.updateUser(createdAdminUser.id, { hotel_id: createdHotel.id });

    // If setup token needed, create record in password_reset_tokens
    if (setupToken) {
      await tokenModel.invalidateUserTokens(createdAdminUser.id);
      await tokenModel.createResetToken({
        userId: createdAdminUser.id,
        token: setupToken,
        expiresAt: setupTokenExpiry,
      });
    }
  } catch (err) {
    // Compensatory cleanup if error occurs
    if (createdHotel?.id) {
      await db('hotels').where({ id: createdHotel.id }).del().catch(() => { });
    }
    if (isNewUserCreated && createdAdminUser?.id) {
      await db('users').where({ id: createdAdminUser.id }).del().catch(() => { });
    }
    throw err;
  }

  // 6. Enqueue Welcome Email
  const adminBaseUrl = (
    process.env.ADMIN_URL ||
    process.env.WEB_URL ||
    'https://hotel-management-admin-livid.vercel.app'
  ).replace(/\/+$/, '');

  const portalUrl = `${adminBaseUrl}/login`;
  const setupUrl = `${adminBaseUrl}/reset-password?token=${setupToken}`;

  try {
    await queueEmail('HOTEL_REGISTERED', normalizedEmail, {
      hotelName: createdHotel.name,
      ownerName: createdAdminUser.name,
      adminEmail: normalizedEmail,
      trialStartDate: trialStartDate.toLocaleDateString('en-IN'),
      trialEndDate: trialEndDate.toLocaleDateString('en-IN'),
      portalUrl,
      setupUrl,
      temporaryPassword: rawTempPassword,
    });
  } catch (queueErr) {
    console.error('[HotelService] Failed to enqueue welcome email:', queueErr.message);
  }

  await auditService.record({
    actor: actor?.id
      ? actor
      : {
        id: createdAdminUser.id,
        name: createdAdminUser.name,
        role: createdAdminUser.role,
        hotel_id: createdHotel.id,
        request_meta: actor?.request_meta,
      },
    action: AUDIT_ACTIONS.CREATE,
    entityType: AUDIT_ENTITIES.HOTEL,
    entityId: createdHotel.id,
    hotelId: createdHotel.id,
    description: `Hotel '${createdHotel.name}' ${actor?.id ? 'created' : 'registered'}.`,
  });

  // 7. Generate Authentication Tokens & Set HttpOnly Cookies
  const accessToken = generateAccessToken(createdAdminUser.id, createdAdminUser.role, createdHotel.id);
  const refreshToken = generateRefreshToken(createdAdminUser.id, createdHotel.id);

  if (res) {
    setAuthCookies(res, accessToken, refreshToken);
  }

  // 8. Return Sanitized Response Payload
  return {
    hotel: createdHotel,
    admin: {
      id: createdAdminUser.id,
      name: createdAdminUser.name,
      email: createdAdminUser.email,
      role: createdAdminUser.role,
      is_active: Boolean(createdAdminUser.is_active),
      hotel_id: createdHotel.id,
    },
    trial: {
      start_date: trialStartDate,
      end_date: trialEndDate,
      duration,
      unit,
    },
    auth: {
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    },
  };
};

/**
 * Create a hotel on behalf of a super admin.
 * Same provisioning as public registration (owner account, trial, welcome email),
 * but nobody is signed in and no token is returned.
 * @param {Object} payload
 * @param {Array<Object>} [files=[]]
 * @param {Object} reqUser - Super admin creating the hotel
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const createHotel = async (payload, files = [], reqUser) => {
  const { hotel } = await registerHotel(payload, null, files, reqUser);

  return { id: hotel.id };
};

/**
 * List hotels for the super admin.
 * @param {Object} query - page, limit, search, is_active, subscription_plan_id, subscription_plan_active, sort_by, sort_order
 * @returns {Promise<Object>}
 */
const getHotels = async (query = {}) => {
  return hotelModel.findHotels(
    {
      search: query.search,
      is_active: query.is_active,
      subscription_plan_id: query.subscription_plan_id,
      subscription_plan_active: query.subscription_plan_active,
    },
    { page: query.page, limit: query.limit },
    { sort_by: query.sort_by, sort_order: query.sort_order }
  );
};

/**
 * Get one hotel with its owner summary.
 * @param {number|string} id
 * @returns {Promise<Object>}
 */
const getHotelById = async (id) => {
  const hotel = await hotelModel.findHotelById(id);
  if (!hotel) {
    throw new AppError('Hotel not found.', HTTP_STATUS.NOT_FOUND);
  }
  return hotel;
};

const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const toDateOrNull = (value) => (value ? new Date(value) : null);

// Plain text columns a super admin can change. Values are trimmed.
const EDITABLE_TEXT_FIELDS = [
  'name',
  'address',
  'city',
  'state',
  'country',
  'pincode',
  'hotel_type',
  'website',
];

/**
 * Update hotel details and subscription for the super admin.
 * Switching the hotel on or off is a separate call: setHotelActive.
 * Send only the keys that change. The slug and the owner account stay as they are.
 * @param {number|string} id
 * @param {Object} payload
 * @param {Array<Object>} [files=[]]
 * @param {Object} reqUser - Super admin making the change
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const updateHotel = async (id, payload, files = [], reqUser) => {
  const existing = await getHotelById(id);

  const updates = {};

  EDITABLE_TEXT_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = String(payload[field] ?? '').trim();
    }
  });

  if (payload.gst_number !== undefined) {
    updates.gst_number = String(payload.gst_number ?? '').trim().toUpperCase();
    updates.gst_enabled = Boolean(updates.gst_number);
  }
  if (payload.pan_number !== undefined) {
    updates.pan_number = String(payload.pan_number ?? '').trim().toUpperCase();
  }
  BANK_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = cleanBankValue(field, payload[field]);
    }
  });
  if (payload.total_rooms !== undefined) {
    updates.total_rooms = Number(payload.total_rooms) || 0;
  }

  if (payload.subscription_plan_id !== undefined) {
    const plan = await subscriptionPlanModel.findPlanById(Number(payload.subscription_plan_id));
    if (!plan) {
      throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
    }
    updates.subscription_plan_id = plan.id;
  }
  if (payload.subscription_plan_active !== undefined) {
    updates.subscription_plan_active = toBoolean(payload.subscription_plan_active);
  }
  if (payload.subscription_plan_start_date !== undefined) {
    updates.subscription_plan_start_date = toDateOrNull(payload.subscription_plan_start_date);
  }
  if (payload.subscription_plan_end_date !== undefined) {
    updates.subscription_plan_end_date = toDateOrNull(payload.subscription_plan_end_date);
  }
  if (payload.auto_renew !== undefined) {
    updates.auto_renew = toBoolean(payload.auto_renew);
  }

  const logoUrl = await uploadHotelLogo(files);
  if (logoUrl) {
    updates.logo = logoUrl;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('Send at least one field to update.', HTTP_STATUS.BAD_REQUEST);
  }

  await hotelModel.updateHotel(id, updates);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.UPDATE,
    entityType: AUDIT_ENTITIES.HOTEL,
    entityId: existing.id,
    hotelId: existing.id,
    description: `Hotel '${existing.name}' updated.`,
    changes: auditService.diffChanges(
      {
        ...existing,
        gst_enabled: existing.settings.gst_enabled,
        auto_renew: existing.subscription.auto_renew,
      },
      updates
    ),
  });

  return { id: existing.id };
};

/**
 * Switch a hotel on or off.
 * While a hotel is off, none of its users can log in or call any protected API,
 * and clients that are already connected are dropped. Nothing is deleted.
 * @param {number|string} id
 * @param {boolean|string} isActive
 * @param {Object} reqUser - Super admin making the change
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const setHotelActive = async (id, isActive, reqUser) => {
  const hotel = await getHotelById(id);
  const active = toBoolean(isActive);

  await hotelModel.updateHotel(hotel.id, { is_active: active });

  if (!active) {
    disconnectHotel(hotel.id);
  }

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entityType: AUDIT_ENTITIES.HOTEL,
    entityId: hotel.id,
    hotelId: hotel.id,
    description: `Hotel '${hotel.name}' ${active ? 'activated' : 'deactivated'}.`,
    changes: auditService.diffChanges(hotel, { is_active: active }),
  });

  return { id: hotel.id };
};

/**
 * Soft delete a hotel and every user of that hotel, so nobody can sign in to it again.
 * Rooms and bookings stay in the database.
 * @param {number|string} id
 * @param {Object} reqUser - Super admin deleting the hotel
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const deleteHotel = async (id, reqUser) => {
  const hotel = await getHotelById(id);

  await db.transaction(async (trx) => {
    await hotelModel.softDeleteHotel(hotel.id, trx);
    await userModel.softDeleteUsersByHotelId(hotel.id, trx);
  });

  disconnectHotel(hotel.id);

  await auditService.record({
    actor: reqUser,
    action: AUDIT_ACTIONS.DELETE,
    entityType: AUDIT_ENTITIES.HOTEL,
    entityId: hotel.id,
    hotelId: hotel.id,
    description: `Hotel '${hotel.name}' deleted.`,
  });

  return { id: hotel.id };
};

module.exports = {
  generateUniqueHotelSlug,
  calculateTrialDates,
  registerHotel,
  createHotel,
  getHotels,
  getHotelById,
  updateHotel,
  setHotelActive,
  deleteHotel,
};
