/**
 * db/connection.js
 * PostgreSQL connection pool using the `pg` library.
 * Reads all credentials from .env — never hardcode them here.
 * The pool is shared across the entire application.
 */

'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // SSL required for DigitalOcean Managed PostgreSQL and most cloud providers
  ssl: {
    rejectUnauthorized: false,  // set to true + provide CA cert in strict production
  },

  // Connection pool settings tuned for large datasets / concurrent requests
  max:                20,   // max pool size
  idleTimeoutMillis:  30000,
  connectionTimeoutMillis: 10000,
  statement_timeout:  120000,  // 2-min hard limit per query
});

// Log pool errors to stdout so they appear in PM2 / Docker logs
pool.on('error', (err) => {
  console.error('[DB Pool] Unexpected error on idle client:', err.message);
});

/**
 * Convenience wrapper — executes a parameterized query.
 * Always use this instead of pool.query() directly from routes,
 * so we have a single place to add logging / tracing later.
 *
 * @param {string} text   — SQL string with $1 … $n placeholders
 * @param {Array}  params — parameter values array
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB] query executed in ${duration}ms | rows: ${result.rowCount}`);
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '\nSQL:', text, '\nParams:', params);
    throw err;
  }
}

/**
 * Health check — verifies the pool can reach the database.
 */
async function ping() {
  const result = await query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

module.exports = { pool, query, ping };
