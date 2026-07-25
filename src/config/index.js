const logger = require('../utils/logger.js');

function required(name) {
  const value = process.env[name];
  if (!value) {
    logger.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const environment = process.env.NODE_ENV || 'development';

const config = {
  environment,
  isProduction: environment === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'INFO',

  claudeApiKey: required('ANTHROPIC_API_KEY'),

  database: {
    host: required('DB_HOST'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME')
  },

  herald: {
    url: process.env.HERALD_URL || 'http://localhost:8887'
  },

  qrAdminEmail: process.env.QR_ADMIN_EMAIL,

  whatsapp: {
    clientesGroupId: process.env.WHATSAPP_CLIENTES_GROUP_ID
  }
};

logger.info(`🔧 Configuration loaded (${config.environment})`);
logger.info(`   Herald: ${config.herald.url}`);
logger.info(`   Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
logger.info(`   QR Admin Email: ${config.qrAdminEmail}`);

module.exports = config;
