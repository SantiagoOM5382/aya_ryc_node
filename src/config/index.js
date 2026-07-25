const logger = require('../utils/logger.js');
const { loadParametersFromStore } = require('./parameterStore.js');
const hjson = require('hjson');
const fs = require('fs');
const path = require('path');

// Configuration loading (like bifrost/herald)
const DEFAULT_PATH = '.:/usr/lib/node_modules';
const SEARCH_PATH = (process.env.AL_CONFIG_PATH || DEFAULT_PATH).split(':');
const CONFIG_NAME = process.env.AL_CONFIG || 'config.hjson';

let config = {};

function loadConfigFile() {
  let configData = null;

  for (const searchPath of SEARCH_PATH) {
    try {
      const configPath = path.join(searchPath, CONFIG_NAME);
      const content = fs.readFileSync(configPath, 'utf8');
      configData = hjson.parse(content);
      logger.info(`✅ Loaded config from: ${configPath}`);
      break;
    } catch (error) {
      // Continue to next path
    }
  }

  if (!configData) {
    logger.error(`Configuration file ${CONFIG_NAME} not found in paths: ${SEARCH_PATH.join(', ')}`);
    process.exit(1);
  }

  return configData;
}

function loadEnvironmentTag(conf) {
  conf.environment = process.env.TYT_SERVICE_ENVIRONMENT || process.env.NODE_ENV || 'development';
  return conf;
}

function buildServiceUrl(conf, serviceName) {
  if (!conf.ecs_cluster || !conf.ecs_cluster.url) {
    return null;
  }
  return `${conf.ecs_cluster.url}/${serviceName}`;
}

async function loadParameterStoreOverrides(conf) {
  if (conf.environment === 'development') {
    return conf;
  }

  if (!['integration', 'production'].includes(conf.environment)) {
    return conf;
  }

  try {
    const path = `/${conf.company}/${conf.service_name}/${conf.environment}`;
    logger.info(`Loading Parameter Store overrides from: ${path}`);
    const storeParams = await loadParametersFromStore(conf.environment);

    // Merge Parameter Store values (flat structure)
    if (storeParams.db_host) conf.database.host = storeParams.db_host;
    if (storeParams.db_port) conf.database.port = parseInt(storeParams.db_port);
    if (storeParams.db_user) conf.database.user = storeParams.db_user;
    if (storeParams.db_password) conf.database.password = storeParams.db_password;
    if (storeParams.db_name) conf.database.database = storeParams.db_name;
    if (storeParams.ecs_cluster_url) conf.ecs_cluster.url = storeParams.ecs_cluster_url;
    if (storeParams.qr_admin_email) conf.herald.adminEmail = storeParams.qr_admin_email;
  } catch (error) {
    logger.warn(`Parameter Store load failed: ${error.message} - using config.hjson values`);
  }

  return conf;
}

function initializeConfigSync() {
  // 1. Load config.hjson (mutate in place so the already-exported object stays valid)
  Object.assign(config, loadConfigFile());

  // 2. Load TYT_SERVICE_ENVIRONMENT
  loadEnvironmentTag(config);

  // 3. Load ANTHROPIC_API_KEY from env (always from env, never stored in Parameter Store)
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.error('Missing required environment variable: ANTHROPIC_API_KEY');
    process.exit(1);
  }
  config.claudeApiKey = process.env.ANTHROPIC_API_KEY;

  // 4. Resolve service URLs from ECS cluster (only if not already set in config)
  if (!config.herald.url || config.herald.url === '') {
    config.herald.url = buildServiceUrl(config, 'herald') || 'http://localhost:8887';
  }

  // 5. Map qrAdminEmail to environment variable name for whatsappClient compatibility
  if (config.qrAdminEmail) {
    process.env.QR_ADMIN_EMAIL = config.qrAdminEmail;
  }

  // 6. Add computed properties
  config.isProduction = config.environment === 'production';
  config.isDocker = config.environment !== 'development';

  // 7. Log startup
  logger.info(`🔧 Configuration loaded (${config.environment})`);
  logger.info(`   ECS Cluster: ${config.ecs_cluster.url}`);
  logger.info(`   Herald: ${config.herald.url}`);
  logger.info(`   Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
  logger.info(`   QR Admin Email: ${config.qrAdminEmail}`);
}

async function applyParameterStoreOverrides() {
  try {
    await loadParameterStoreOverrides(config);
  } catch (error) {
    logger.error(`Config initialization failed: ${error.message}`);
    process.exit(1);
  }
}

// Load config.hjson and env vars synchronously so requirers get real values immediately.
initializeConfigSync();

// Parameter Store overrides (integration/production only) mutate `config` in place once resolved.
applyParameterStoreOverrides();

module.exports = config;
