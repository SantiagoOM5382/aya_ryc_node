const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger.js');

const LOGS_DIR = path.join(__dirname, '../../../logs');
const TRANSFER_LOG = path.join(LOGS_DIR, 'advisor-transfer.log');
const TRANSFER_STATE = path.join(LOGS_DIR, 'advisor-transfer.json');

// Keywords that indicate chat is ready to transfer to advisor
const TRANSFER_READY_KEYWORDS = [
  // Explicit transfer mentions - only these specific phrases indicate final transfer
  'te conectamos con nuestro asesor',
  'estás listo para ser asesorado',
  'solicitud está confirmada',
  'te transferimos con nuestro',
  'ahora te conectamos',
  'tu reserva está lista',
  'listo para ser asesorado',
  'resumen de su cotización',
  'reserva está lista',
  '✅ tu reserva está lista',
  'asesor de reservas verificará'
];

// Ensure logs directory exists
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    logger.info(`Created logs directory: ${LOGS_DIR}`);
  }
}

// Check if bot response indicates transfer readiness
function isReadyForTransfer(botResponse) {
  if (!botResponse) return false;
  const lowerText = botResponse.toLowerCase();
  return TRANSFER_READY_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Add visual indicator to bot response
function addTransferReadyIndicator(response) {
  return `${response}\n\n✅ *Chat marcado como LISTO PARA TRANSFERIR A ASESOR*`;
}

// Log to file when chat is ready for transfer
function logTransferReady(userId, timestamp, botResponse) {
  try {
    ensureLogsDir();
    const logEntry = `[${timestamp}] User: ${userId} | Status: READY_FOR_TRANSFER\nBot Response: ${botResponse.substring(0, 100)}...\n---\n`;
    fs.appendFileSync(TRANSFER_LOG, logEntry, 'utf-8');
    logger.info(`✅ Logged transfer readiness for ${userId} to ${TRANSFER_LOG}`);
  } catch (error) {
    logger.error(`Failed to log transfer readiness: ${error.message}`);
  }
}

// Update state file with ready-for-transfer chats
function updateTransferState(userId, timestamp, botResponse) {
  try {
    ensureLogsDir();
    let state = { readyForTransfer: [] };

    // Load existing state
    if (fs.existsSync(TRANSFER_STATE)) {
      const existing = fs.readFileSync(TRANSFER_STATE, 'utf-8');
      state = JSON.parse(existing);
    }

    // Add or update user
    const existingIndex = state.readyForTransfer.findIndex(u => u.userId === userId);
    const entry = {
      userId,
      timestamp,
      readySince: timestamp,
      lastBotMessage: botResponse.substring(0, 150),
      transferred: false
    };

    if (existingIndex !== -1) {
      // Update existing entry, keep original readySince
      entry.readySince = state.readyForTransfer[existingIndex].readySince;
      state.readyForTransfer[existingIndex] = entry;
    } else {
      // Add new entry
      state.readyForTransfer.push(entry);
    }

    // Write updated state
    fs.writeFileSync(TRANSFER_STATE, JSON.stringify(state, null, 2), 'utf-8');
    logger.info(`✅ Updated transfer state file for ${userId}`);
  } catch (error) {
    logger.error(`Failed to update transfer state: ${error.message}`);
  }
}

// Get all chats ready for transfer
function getReadyForTransferChats() {
  try {
    ensureLogsDir();
    if (!fs.existsSync(TRANSFER_STATE)) {
      return [];
    }
    const state = fs.readFileSync(TRANSFER_STATE, 'utf-8');
    const parsed = JSON.parse(state);
    return parsed.readyForTransfer || [];
  } catch (error) {
    logger.error(`Failed to read transfer state: ${error.message}`);
    return [];
  }
}

// Mark chat as transferred (advisor picked it up)
function markAsTransferred(userId) {
  try {
    ensureLogsDir();
    if (!fs.existsSync(TRANSFER_STATE)) {
      return false;
    }

    const state = JSON.parse(fs.readFileSync(TRANSFER_STATE, 'utf-8'));
    const index = state.readyForTransfer.findIndex(u => u.userId === userId);

    if (index !== -1) {
      state.readyForTransfer[index].transferred = true;
      state.readyForTransfer[index].transferredAt = new Date().toISOString();
      fs.writeFileSync(TRANSFER_STATE, JSON.stringify(state, null, 2), 'utf-8');
      logger.info(`✅ Marked ${userId} as transferred to advisor`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Failed to mark as transferred: ${error.message}`);
    return false;
  }
}

// Print summary of ready chats
function printReadySummary() {
  const chats = getReadyForTransferChats();
  const readyChats = chats.filter(c => !c.transferred);

  if (readyChats.length === 0) {
    logger.info('No hay chats listos para transferir en este momento.');
    return;
  }

  logger.info(`\n${'='.repeat(60)}`);
  logger.info('📊 RESUMEN - CHATS LISTOS PARA TRANSFERIR A ASESOR');
  logger.info(`${'='.repeat(60)}`);
  readyChats.forEach((chat, index) => {
    logger.info(`${index + 1}. Cliente: ${chat.userId}`);
    logger.info(`   Listo desde: ${chat.readySince}`);
    logger.info(`   Último mensaje: ${chat.lastBotMessage}`);
    logger.info('---');
  });
  logger.info(`Total: ${readyChats.length} chat(s) listos para transferir`);
  logger.info(`${'='.repeat(60)}\n`);
}

module.exports = {
  isReadyForTransfer,
  addTransferReadyIndicator,
  logTransferReady,
  updateTransferState,
  getReadyForTransferChats,
  markAsTransferred,
  printReadySummary
};
