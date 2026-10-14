/**
 * Hotel service handling business logic, user provisioning,
 * trial calculation, slug generation, and email queuing.
 * Modeled after TradeNexa service layer architecture.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/knex');
const hotelModel = require('../models/hotelModel');
const bookingModel = require('../models/bookingModel');
const userModel = require('../models/userModel');
const tokenModel = require('../models/tokenModel');
const systemSettingsModel = require('../models/systemSettingsModel');
const s3Service = require('./s3Service');
const { checkEmailExistsGlobally } = require('../utils/emailValidator');
const { queueEmail } = require('../queues/emailQueue');
const {
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
} = require('../utils/jwt');
const { AppError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');

/**
 * Generate a cryptographically secure temporary password.
 * Format: "Temp#" + 8 random hex characters (e.g. Temp#a8f12b0e)
 * Never derived from owner's name.
 */
const generateSecureTempPassword = () => {
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `Temp#${randomSuffix}`;
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
 * Register a new hotel and provision hotel administrator account.
 *
 * @param {Object} payload - Registration body
 * @param {import('express').Response} [res] - Optional Express response for HTTP-only cookies
 * @returns {Promise<Object>} Safe response data
 */
const registerHotel = async (payload, res = null, files = []) => {
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

  // The logo arrives only as a form-data file.
  let uploadedLogoUrl = null;
  const logoFile = Array.isArray(files)
    ? files.find((f) => f.fieldname === 'logo' || f.fieldname === 'logo_image' || f.fieldname === 'file')
    : (files && (files.logo?.[0] || files.logo_image?.[0] || files.file?.[0]));

  if (logoFile && logoFile.buffer) {
    try {
      const uploadResult = await s3Service.uploadFile(logoFile, 'hotels/logos');
      if (uploadResult && uploadResult.imageUrl) {
        uploadedLogoUrl = uploadResult.imageUrl;
      }
    } catch (s3Error) {
      throw new AppError(
        `Failed to upload hotel logo to S3: ${s3Error.message}`,
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

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
      total_rooms: totalRooms ? Number(totalRooms) : 0,
      hotel_type: hotelType ? hotelType.trim() : 'Boutique Hotel',
      website: website ? website.trim() : '',
      logo: uploadedLogoUrl || null,
      status: 'ACTIVE',
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

module.exports = {
  generateSecureTempPassword,
  generateUniqueHotelSlug,
  calculateTrialDates,
  registerHotel,
};
