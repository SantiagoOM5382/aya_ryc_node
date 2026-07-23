const mysql = require('mysql2/promise');
const logger = require('../utils/logger.js');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'admin_tiquetes',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

// Test connection
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.execute('SELECT 1');
    connection.release();
    logger.info('✅ Database connection successful');
  } catch (error) {
    logger.error('Database connection failed', error);
    throw error;
  }
}

// Query helper
async function query(sql, values) {
  try {
    const connection = await pool.getConnection();
    const [results] = await connection.execute(sql, values);
    connection.release();
    return results;
  } catch (error) {
    logger.error(`Database query failed: ${sql}`, error);
    throw error;
  }
}

// Get single row
async function getOne(sql, values) {
  const results = await query(sql, values);
  return results.length > 0 ? results[0] : null;
}

// Execute insert/update/delete
async function execute(sql, values) {
  return await query(sql, values);
}

module.exports = {
  pool,
  testConnection,
  query,
  getOne,
  execute
};
