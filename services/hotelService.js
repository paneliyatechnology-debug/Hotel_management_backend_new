/**
 * Hotel service handling business logic, user provisioning,
 * trial calculation, slug generation, and email queuing.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/knex');
const hotelModel = require('../models/hotelModel');
const userModel = require('../models/userModel');
const tokenModel = require('../models/tokenModel');
const subscriptionPlanModel = require('../models/subscriptionPlanModel');
const uploadService = require('./uploadService');
const auditService = require('./auditService');
const paymentMethodModel = require('../models/paymentMethodModel');
const { checkEmailExistsGlobally } = require('../utils/emailValidator');
const { queueEmail } = require('../queues/emailQueue');
const { buildPortalLinks } = require('../utils/frontendUrl');
const { disconnectHotel, scheduleHotelDashboard } = require('../sockets/roomSocket');
const {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} = require('../utils/jwt');
const { generateSecureTempPassword } = require('../utils/password');
const { AppError } = require('../utils/response');
const { resolveHotelId } = require('../utils/hotelScope');
const { HTTP_STATUS, AUDIT_ACTIONS, AUDIT_ENTITIES, ROLE_CODES } = require('../constants');

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

const toBoolean = (value) => value === true || value === 'true' || value === 1 || value === '1';

const DEFAULT_AMENITIES = ['Free WiFi', '24/7 Room Service', 'Air Conditioning'];
const DEFAULT_POLICIES = [
  'Valid Government ID required at check-in',
  'No smoking in standard rooms',
];

/**
 * Parse amenities or policies from JSON array text or a comma-separated list.
 * @param {*} value
 * @returns {string[]}
 */
const parseListField = (value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value).trim();
  if (text.startsWith('[')) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  }
  return text.split(',').map((item) => item.trim()).filter(Boolean);
};

/**
 * Operational settings from a request body. Only keys that were sent are returned.
 * @param {Object} payload
 * @param {{ withDefaults?: boolean }} [options]
 * @returns {Object}
 */
const buildSettingsValues = (payload, { withDefaults = false } = {}) => {
  const settings = {};
  const setText = (field, fallback) => {
    if (payload[field] !== undefined) {
      const text = String(payload[field] ?? '').trim();
      settings[field] = text || (withDefaults ? fallback : '');
    } else if (withDefaults) {
      settings[field] = fallback;
    }
  };

  setText('check_in_time', '14:00');
  setText('check_out_time', '12:00');
  setText('timezone', 'Asia/Kolkata');
  setText('currency', 'INR');
  setText('upi_id', null);

  if (payload.tax_percentage !== undefined && payload.tax_percentage !== '') {
    settings.tax_percentage = Number(payload.tax_percentage);
  } else if (withDefaults) {
    settings.tax_percentage = 18;
  }

  if (payload.late_checkout_grace_minutes !== undefined && payload.late_checkout_grace_minutes !== '') {
    settings.late_checkout_grace_minutes = Number(payload.late_checkout_grace_minutes);
  } else if (withDefaults) {
    settings.late_checkout_grace_minutes = 10;
  }

  if (payload.amenities !== undefined) {
    settings.amenities = JSON.stringify(parseListField(payload.amenities));
  } else if (withDefaults) {
    settings.amenities = JSON.stringify(DEFAULT_AMENITIES);
  }

  if (payload.policies !== undefined) {
    settings.policies = JSON.stringify(parseListField(payload.policies));
  } else if (withDefaults) {
    settings.policies = JSON.stringify(DEFAULT_POLICIES);
  }

  // Empty upi_id clears the column.
  if (settings.upi_id === '') settings.upi_id = null;

  return settings;
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

const TRIAL_DAYS = 30;

/**
 * Trial window for a newly registered hotel. Always 30 days from now.
 * @returns {{ trialStartDate: Date, trialEndDate: Date, duration: number, unit: string }}
 */
const calculateTrialDates = () => {
  const trialStartDate = new Date();
  const trialEndDate = new Date(trialStartDate.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  return {
    trialStartDate,
    trialEndDate,
    duration: TRIAL_DAYS,
    unit: 'days',
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
    const uploadResult = await uploadService.uploadFile(logoFile, 'hotels/logos');
    return uploadResult?.imageUrl || null;
  } catch (s3Error) {
    throw new AppError(
      `Failed to upload hotel logo: ${s3Error.message}`,
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

  // 3. Free trial is a fixed 30 days from registration.
  const { trialStartDate, trialEndDate, duration, unit } = calculateTrialDates();

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
    // No plan id means the catalog plan whose code is TRIAL.
    let finalPlanId = payload.subscription_plan_id || payload.subscriptionPlanId || null;
    if (!finalPlanId) {
      const trialPlan = await subscriptionPlanModel.findPlanByCode('TRIAL');
      if (!trialPlan) {
        throw new AppError('Trial subscription plan (code TRIAL) is not configured.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
      finalPlanId = trialPlan.id;
    } else {
      finalPlanId = Number(finalPlanId);
    }

    const assignedPlan = await subscriptionPlanModel.findPlanById(finalPlanId, { includeDeleted: true });
    if (!assignedPlan) {
      throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
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

    // Hotel is created inactive (is_active: false) by default.
    // Super admin can explicitly specify is_active on create; public registration is always false.
    const initialIsActive =
      actor?.id && actor?.role === ROLE_CODES.SUPER_ADMIN && payload.is_active !== undefined
        ? toBoolean(payload.is_active)
        : false;

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
      is_active: initialIsActive,
      subscription_plan_id: assignedPlan.id,
      gst_enabled: payload.gst_enabled !== undefined ? toBoolean(payload.gst_enabled) : Boolean(gstNumber),
      ...buildSettingsValues(payload, { withDefaults: true }),
    };

    createdHotel = await hotelModel.createHotel(hotelData);
    await paymentMethodModel.seedSystemMethods(createdHotel.id);

    await subscriptionPlanModel.createPurchase({
      hotel_id: createdHotel.id,
      plan_id: assignedPlan.id,
      purchased_by: createdAdminUser.id,
      amount: assignedPlan.price,
      billing_cycle: assignedPlan.billing_cycle,
      payment_method: null,
      status: finalPlanActive ? 'PAID' : 'INACTIVE',
      auto_renew: false,
      starts_at: finalStartDate,
      ends_at: finalEndDate,
    });
    createdHotel = await hotelModel.findHotelById(createdHotel.id);

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
  // Same web app as the forgot-password link, not the super admin console.
  const { portalUrl, setupUrl } = buildPortalLinks(setupToken);

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
 * Profile columns (name, address, tax numbers, bank details) taken from a request body.
 * Only keys that were sent are returned. Shared by the super admin and the hotel admin updates.
 * @param {Object} payload
 * @returns {Object}
 */
const buildProfileUpdates = (payload) => {
  const updates = {};

  EDITABLE_TEXT_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = String(payload[field] ?? '').trim();
    }
  });

  if (payload.gst_number !== undefined) {
    updates.gst_number = String(payload.gst_number ?? '').trim().toUpperCase();
  }
  if (payload.gst_enabled !== undefined) {
    updates.gst_enabled = toBoolean(payload.gst_enabled);
  }
  if (payload.pan_number !== undefined) {
    updates.pan_number = String(payload.pan_number ?? '').trim().toUpperCase();
  }
  BANK_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) {
      updates[field] = cleanBankValue(field, payload[field]);
    }
  });

  Object.assign(updates, buildSettingsValues(payload));

  return updates;
};

/**
 * Save the logo and the collected changes of a hotel, then write the audit entry.
 * @param {Object} existing - Hotel before the change (from getHotelById)
 * @param {Object} updates - Columns to change
 * @param {Array<Object>} files - Uploaded files. The first image becomes the logo
 * @param {Object} reqUser - User making the change
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const saveHotelUpdate = async (existing, updates, files, reqUser) => {
  const logoUrl = await uploadHotelLogo(files);
  if (logoUrl) {
    updates.logo = logoUrl;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError('Send at least one field to update.', HTTP_STATUS.BAD_REQUEST);
  }

  await hotelModel.updateHotel(existing.id, updates);

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
        ...existing.settings,
        amenities: JSON.stringify(existing.settings.amenities || []),
        policies: JSON.stringify(existing.settings.policies || []),
        gst_enabled: existing.settings.gst_enabled,
        auto_renew: existing.subscription.auto_renew,
      },
      updates
    ),
  });

  scheduleHotelDashboard(existing.id);
  return { id: existing.id };
};

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

  const updates = buildProfileUpdates(payload);
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

  const purchaseTouched = await syncCurrentPurchase(existing, updates, payload);
  if (Object.keys(updates).length === 0) {
    if (!purchaseTouched) {
      throw new AppError('Send at least one field to update.', HTTP_STATUS.BAD_REQUEST);
    }
    await auditService.record({
      actor: reqUser,
      action: AUDIT_ACTIONS.UPDATE,
      entityType: AUDIT_ENTITIES.HOTEL,
      entityId: existing.id,
      hotelId: existing.id,
      description: `Hotel '${existing.name}' subscription updated.`,
    });
    scheduleHotelDashboard(existing.id);
    return { id: existing.id };
  }

  return saveHotelUpdate(existing, updates, files, reqUser);
};

/**
 * Write subscription window changes onto the hotel's current plan purchase.
 * The hotel row only keeps subscription_plan_id. Dates, active flag, and auto_renew
 * are removed from the hotel update and stored on subscription_plan_purchases.
 * A different plan id expires a purchase that has not ended, then inserts the new purchase.
 * @param {Object} existing
 * @param {Object} updates - Hotel column updates. Subscription window keys are removed.
 * @param {Object} payload
 * @returns {Promise<boolean>} True when a purchase row was written
 */
const syncCurrentPurchase = async (existing, updates, payload) => {
  const windowSent =
    payload.subscription_plan_active !== undefined ||
    payload.subscription_plan_start_date !== undefined ||
    payload.subscription_plan_end_date !== undefined ||
    payload.auto_renew !== undefined;
  const planSent = updates.subscription_plan_id !== undefined;
  if (!windowSent && !planSent) return false;

  const current = await subscriptionPlanModel.findCurrentByHotelId(existing.id);
  const planId = planSent ? updates.subscription_plan_id : existing.subscription_plan_id;
  if (!planId) return false;

  const plan = await subscriptionPlanModel.findPlanById(planId, { includeDeleted: true });
  if (!plan) {
    throw new AppError('Subscription plan not found.', HTTP_STATUS.NOT_FOUND);
  }

  const status =
    payload.subscription_plan_active !== undefined
      ? toBoolean(payload.subscription_plan_active)
        ? 'PAID'
        : 'INACTIVE'
      : current?.status || 'PAID';
  const startsAt =
    payload.subscription_plan_start_date !== undefined
      ? toDateOrNull(payload.subscription_plan_start_date)
      : current?.starts_at || new Date();
  const endsAt =
    payload.subscription_plan_end_date !== undefined
      ? toDateOrNull(payload.subscription_plan_end_date)
      : current?.ends_at || null;
  const autoRenew =
    payload.auto_renew !== undefined ? toBoolean(payload.auto_renew) : Boolean(current?.auto_renew);

  const planChanged = !current || Number(current.plan_id) !== Number(planId);
  if (planChanged) {
    await db.transaction(async (trx) => {
      await subscriptionPlanModel.expireOpenPurchases(existing.id, new Date(), trx);
      await subscriptionPlanModel.createPurchase({
        hotel_id: existing.id,
        plan_id: plan.id,
        amount: plan.price,
        billing_cycle: plan.billing_cycle,
        payment_method: null,
        status,
        auto_renew: autoRenew,
        starts_at: startsAt || new Date(),
        ends_at: endsAt,
      }, trx);
    });
  } else {
    await subscriptionPlanModel.updatePurchase(current.id, {
      status,
      starts_at: startsAt,
      ends_at: endsAt,
      auto_renew: autoRenew,
    });
  }

  return true;
};

// Owner login details stay on the user account. This route never changes them.
const HOTEL_ADMIN_LOCKED_FIELDS = ['owner_email', 'owner_phone'];

/**
 * Update the logged-in hotel admin's own hotel profile.
 * Only the profile and operational settings (check-in / check-out, tax, gst_enabled, UPI, amenities, policies, logo) can change.
 * The hotel comes from the token. The owner's email and phone, the plan and the quota are never changed here.
 * @param {Object} payload
 * @param {Array<Object>} [files=[]]
 * @param {Object} reqUser - Hotel admin making the change
 * @returns {Promise<{ id: number }>} Id of the affected record
 */
const updateOwnHotel = async (payload, files = [], reqUser) => {
  const locked = HOTEL_ADMIN_LOCKED_FIELDS.filter((field) => payload[field] !== undefined);
  if (locked.length > 0) {
    throw new AppError(
      `${locked.join(', ')} cannot be updated.`,
      HTTP_STATUS.BAD_REQUEST,
      locked.map((field) => ({ field, message: `${field} cannot be updated.` }))
    );
  }

  const existing = await getHotelById(resolveHotelId(reqUser));
  return saveHotelUpdate(existing, buildProfileUpdates(payload), files, reqUser);
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
  registerHotel,
  createHotel,
  getHotels,
  getHotelById,
  updateHotel,
  updateOwnHotel,
  setHotelActive,
  deleteHotel,
};
