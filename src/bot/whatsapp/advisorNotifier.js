const logger = require('../../utils/logger.js');
const fs = require('fs');
const path = require('path');

let whatsappClient = null;
let clientesGroupId = process.env.WHATSAPP_CLIENTES_GROUP_ID || null;
const GROUP_CONFIG_FILE = path.join(__dirname, '../../../logs', '.group-cache.json');

function setWhatsAppClient(client) {
  whatsappClient = client;
  logger.debug('WhatsApp client registered with advisor notifier');

  // If ID is provided via env, use it directly
  if (clientesGroupId) {
    logger.info(`✅ Using configured Clientes group ID: ${clientesGroupId}`);
  } else {
    // Otherwise try to find it with aggressive retries
    findAndCacheClientesGroupWithRetries();
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findAndCacheClientesGroupWithRetries(maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (!whatsappClient) {
        logger.debug('Client not ready yet, will retry...');
        await sleep(2000);
        continue;
      }

      logger.debug(`🔍 Searching for "Clientes" group (attempt ${attempt}/${maxAttempts})...`);
      const chats = await whatsappClient.getChats();

      const clientesGroup = chats.find(chat => {
        if (!chat.isGroup || !chat.name) return false;
        return chat.name.toLowerCase().includes('clientes');
      });

      if (clientesGroup) {
        clientesGroupId = clientesGroup.id._serialized || clientesGroup.id;

        // Cache the group ID
        const logsDir = path.dirname(GROUP_CONFIG_FILE);
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }

        fs.writeFileSync(GROUP_CONFIG_FILE, JSON.stringify({
          groupId: clientesGroupId,
          groupName: clientesGroup.name,
          foundAt: new Date().toISOString()
        }, null, 2), 'utf-8');

        logger.info(`✅ Found and cached "Clientes" group: ${clientesGroup.name} (ID: ${clientesGroupId})`);
        return true;
      } else {
        logger.debug(`Attempt ${attempt}: "Clientes" group not found yet...`);
      }
    } catch (error) {
      logger.debug(`Attempt ${attempt} failed: ${error.message}`);
    }

    if (attempt < maxAttempts) {
      await sleep(3000);
    }
  }

  logger.warn('⚠️ Could not find "Clientes" group after multiple attempts.');
  logger.warn('📝 ALTERNATIVA: Configura WHATSAPP_CLIENTES_GROUP_ID en tu .env si conoces el ID');
  return false;
}

async function sendNotificationToAdvisors(reservaSummary) {
  try {
    logger.debug(`Attempting to send notification to advisors`);

    if (!whatsappClient) {
      logger.error('❌ WhatsApp client not available');
      return false;
    }

    // Try to use cached group ID
    if (!clientesGroupId) {
      logger.warn('Group ID not cached, attempting to find...');
      const found = await findAndCacheClientesGroupWithRetries(3);
      if (!found) {
        logger.error('❌ Could not find Clientes group');
        logger.error('📝 Solución: Configura WHATSAPP_CLIENTES_GROUP_ID en tu .env');
        return false;
      }
    }

    if (clientesGroupId) {
      logger.debug(`Sending message to group ID: ${clientesGroupId}`);
      await whatsappClient.sendMessage(clientesGroupId, reservaSummary);
      logger.info(`✅ Notification sent to "Clientes" group`);
      return true;
    } else {
      logger.error('❌ No group ID available');
      return false;
    }
  } catch (error) {
    logger.error(`❌ Failed to send notification: ${error.message}`);
    logger.debug(`Error details:`, error);
    return false;
  }
}

module.exports = { sendNotificationToAdvisors, setWhatsAppClient };
