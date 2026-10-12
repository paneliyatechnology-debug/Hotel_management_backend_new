/**
 * Migration: Make otp nullable with default NULL in password_reset_tokens table
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasTable = await knex.schema.hasTable('password_reset_tokens');
  if (hasTable) {
    await knex.raw('ALTER TABLE `password_reset_tokens` MODIFY COLUMN `otp` VARCHAR(10) NULL DEFAULT NULL');
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('password_reset_tokens');
  if (hasTable) {
    await knex.raw('ALTER TABLE `password_reset_tokens` MODIFY COLUMN `otp` VARCHAR(10) NOT NULL');
  }
};
