/**
 * Configuration module
 * Reads from environment variables with sensible defaults per environment
 */

const logger = require('../utils/logger.js');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_DOCKER = process.env.DOCKER_ENV === 'true';

// Validate required variables
const validateRequired = (name, value) => {
  if (!value) {
    logger.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
};

// Get config value: env variable → fallback
const getConfig = (envVar, fallback) => {
  return process.env[envVar] || fallback;
};

const config = {
  // Environment
  environment: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isDocker: IS_DOCKER,

  // API
  apiPort: process.env.API_PORT || (IS_DOCKER ? 3000 : 3000),
  apiUrl: process.env.API_URL || (IS_DOCKER ? 'http://aya-bot:3000' : 'http://localhost:3000'),

  // Claude
  claudeApiKey: validateRequired('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY),

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'admin_tiquetes'
  },

  // Herald (QR email service)
  herald: {
    url: getConfig(
      'HERALD_URL',
      IS_DOCKER
        ? 'http://host.docker.internal:8887'
        : 'http://localhost:8887'
    ),
    adminEmail: process.env.QR_ADMIN_EMAIL || 'admin@example.com'
  },

  // WhatsApp
  whatsapp: {
    clientesGroupId: process.env.WHATSAPP_CLIENTES_GROUP_ID || ''
  }
};

// Log configuration on startup (hide secrets)
logger.info(`🔧 Configuration loaded (${NODE_ENV})`);
if (config.isDocker) {
  logger.info(`   Running in Docker mode`);
}
logger.info(`   API: ${config.apiUrl}`);
logger.info(`   Herald: ${config.herald.url}`);
logger.info(`   Database: ${config.database.host}:${config.database.port}/${config.database.database}`);

module.exports = config;
