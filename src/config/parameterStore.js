/**
 * AWS Parameter Store configuration loader
 * Mirrors tyt_config.py behavior but for Node.js
 */

const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');
const logger = require('../utils/logger.js');

const COMPANY = 'tyt';
const SERVICE_NAME = 'aya-ryc';
const REGION = 'us-east-1';

async function loadParametersFromStore(environment) {
  // Don't load from Parameter Store in development
  if (environment === 'development') {
    logger.debug('Development mode: skipping Parameter Store');
    return {};
  }

  if (!['integration', 'production'].includes(environment)) {
    logger.warn(`Unknown environment: ${environment}, skipping Parameter Store`);
    return {};
  }

  try {
    const client = new SSMClient({ region: REGION });
    const path = `/${COMPANY}/${SERVICE_NAME}/${environment}`;

    logger.info(`Loading parameters from AWS Parameter Store: ${path}`);

    const params = await getParametersByPath(client, path);
    const config = {};

    for (const param of params) {
      const key = param.Name.split('/').pop();
      config[key] = param.Value;
      logger.debug(`Loaded parameter: ${key}`);
    }

    logger.info(`✅ Loaded ${params.length} parameters from AWS Parameter Store`);
    return config;
  } catch (error) {
    logger.error(`Failed to load parameters from AWS Parameter Store: ${error.message}`);
    // Don't crash - fall back to env vars
    return {};
  }
}

async function getParametersByPath(client, path, recursive = true, withDecryption = true) {
  const params = [];
  let nextToken = null;

  while (true) {
    const command = new GetParametersByPathCommand({
      Path: path,
      Recursive: recursive,
      WithDecryption: withDecryption,
      NextToken: nextToken
    });

    try {
      const result = await client.send(command);
      params.push(...(result.Parameters || []));

      if (!result.NextToken) break;
      nextToken = result.NextToken;
    } catch (error) {
      throw error;
    }
  }

  return params;
}

module.exports = {
  loadParametersFromStore
};
