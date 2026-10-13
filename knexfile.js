require('dotenv').config();

module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hotel_management_db',
      charset: 'utf8mb4'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  },

  test: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_TEST_HOST || '127.0.0.1',
      port: Number(process.env.DB_TEST_PORT || process.env.DB_PORT) || 3306,
      user: process.env.DB_TEST_USER || process.env.DB_USER || 'root',
      password: process.env.DB_TEST_PASSWORD !== undefined ? process.env.DB_TEST_PASSWORD : (process.env.DB_PASSWORD || ''),
      database: process.env.DB_TEST_NAME || 'hotel_management_test_db',
      charset: 'utf8mb4'
    },
    pool: {
      min: 1,
      max: 10
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4'
    },
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      directory: './database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './database/seeds'
    }
  }
};
