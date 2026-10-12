const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Check if admin user already exists
  const existing = await knex('users').where({ email: 'admin@hotel.com' }).first();
  if (!existing) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await knex('users').insert({
      name: 'System Admin',
      email: 'admin@hotel.com',
      password: hashedPassword,
      phone: '+919876543210',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      must_change_password: false,
      failed_login_attempts: 0,
      is_deleted: false,
    });
    console.log('[Seed] Admin user created: admin@hotel.com / Admin@123 (SUPER_ADMIN)');
  }
};
