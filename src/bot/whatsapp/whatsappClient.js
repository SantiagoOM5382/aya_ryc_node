const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger.js');
const { callClaude } = require('../handlers/claudeHandler.js');
const { setWhatsAppClient } = require('./advisorNotifier.js');
const { endpoints } = require('../../config/api.js');
const { getReservationByPhone, getPendingReservations } = require('../../services/chatReservationService.js');
const { saveOrUpdateContact, getContactByPhone, blockByPhone, unblockByPhone, listBlocked, isBlocked } = require('../../services/clientContactService.js');
const { getActiveAssignmentsWithDetails, releaseAllAssignments } = require('../../services/chatAssignmentService.js');
const { sendQREmail } = require('../../services/herald.js');
const db = require('../../db/database.js');
const stateManager = require('../../utils/stateManager.js');

let client = null;

// Track active chats for broadcast (populated from incoming messages)
const activeChats = new Map(); // Map<chatId, chatObject>


// Helper to send message to a chat by ID
async function sendMessageToChatId(chatId, message, delay = 1000) {
  try {
    const chat = await client.getChatById(chatId);
    if (chat) {
      await chat.sendMessage(message);
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, delay));
      return { success: true, name: chat.name || chatId };
    } else {
      return { success: false, error: 'Chat not found', name: chatId };
    }
  } catch (error) {
    return { success: false, error: error.message, name: chatId };
  }
}

// Extract advisor name and phone from "atiende [name] [phone]" format
function extractAdvisorAndPhone(text) {
  if (!text) return { advisorName: null, phone: null };
  const match = text.match(/atiende\s+(\S+)\s+(\d+)/i);
  if (match) {
    return {
      advisorName: match[1],
      phone: match[2]
    };
  }
  return { advisorName: null, phone: null };
}

// Check if message indicates assignment (contains "atiende")
function hasAssignmentMessage(text) {
  if (!text) return false;
  return text.toLowerCase().includes('atiende');
}

// Check if message indicates end of advisor service
function isAdvisorReleasingChat(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return lowerText.includes('liberar');
}

// Call API to claim chat assignment
async function claimChatAssignment(chatReservationId, advisorName) {
  try {
    const response = await fetch(endpoints.claimChat(chatReservationId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advisorName })
    });

    if (response.ok) {
      logger.info(`✅ Chat claimed by ${advisorName} for reservation ${chatReservationId}`);
      return true;
    } else {
      // Try to get error message from response
      try {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.statusText}`);
      } catch (parseError) {
        throw new Error(response.statusText);
      }
    }
  } catch (error) {
    logger.error(`Error claiming chat assignment: ${error.message}`);
    throw error;
  }
}

// Call API to release chat assignment
async function releaseChatAssignment(chatReservationId) {
  try {
    const response = await fetch(endpoints.releaseChat(chatReservationId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      logger.info(`✅ Chat released for reservation ${chatReservationId}`);
      return true;
    } else {
      logger.warn(`Failed to release chat: ${response.statusText}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error releasing chat assignment: ${error.message}`);
    return false;
  }
}

// Check chat history for advisor commands
// Note: Advisor commands are now handled via the group chat "Clientes"
// This function is kept for backwards compatibility but returns null
// since all commands should come through the group channel
async function checkForAdvisorCommandsInChat(message) {
  logger.debug(`📋 Advisor commands are now handled via Clientes group - skipping chat history check`);
  return null;
}

async function initializeClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  // QR code for authentication
  client.on('qr', async (qr) => {
    try {
      // Generate QR as base64 image
      const qrBase64 = await qrcodeImage.toDataURL(qr, {
        type: 'image/png',
        width: 300,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      });

      // Send to Herald if admin email is configured
      const adminEmail = process.env.QR_ADMIN_EMAIL;
      if (adminEmail) {
        try {
          await sendQREmail(adminEmail, qrBase64);
          logger.info(`📧 QR sent to ${adminEmail} via Herald`);
        } catch (error) {
          logger.warn(`⚠️ Failed to send QR via Herald: ${error.message}`);
          // Fall back to terminal display
          logger.info('📱 Displaying QR in terminal instead:');
          qrcodeTerminal.generate(qr, { small: true });
        }
      } else {
        // No email configured, show in terminal
        logger.info('📱 No QR_ADMIN_EMAIL configured. Displaying QR in terminal:');
        qrcodeTerminal.generate(qr, { small: true });
      }
    } catch (error) {
      logger.error(`Error handling QR: ${error.message}`);
      // Fallback: always show in terminal
      logger.info('📱 Fallback: Displaying QR in terminal:');
      qrcodeTerminal.generate(qr, { small: true });
    }
  });

  // Ready event
  client.on('ready', async () => {
    logger.info('✅ WhatsApp client is ready!');
    setWhatsAppClient(client);
    const state = stateManager.loadState();
    logger.info(`🤖 Claude state: ${state.claudeEnabled ? '✅ ACTIVE' : '🔴 DOWN'}`);

    // Load chats from WhatsApp Web
    try {
      const allChats = await client.getChats();
      if (allChats && Array.isArray(allChats)) {
        let addedCount = 0;
        for (const chat of allChats) {
          // Only track individual chats (not groups)
          if (!chat.isGroup) {
            if (!activeChats.has(chat.id._serialized)) {
              addedCount++;
            }
            activeChats.set(chat.id._serialized, chat);
          }
        }
        if (activeChats.size > 0) {
          logger.info(`✅ Loaded ${activeChats.size} chats from WhatsApp Web`);
        }
      }
    } catch (error) {
      logger.debug(`Could not load chats from WhatsApp Web (this is normal): ${error.message}`);
    }
  });

  // Authentication failure
  client.on('auth_failure', (msg) => {
    logger.error('Authentication failed:', msg);
  });

  // Disconnected
  client.on('disconnected', (reason) => {
    logger.warn(`WhatsApp disconnected: ${reason}`);
  });

  // Handle incoming messages
  client.on('message', async (message) => {
    try {
      // Check if this is a message from the Clientes group with advisor commands
      // Check by isGroupMsg OR by message.from ending in @g.us
      const isFromGroup = message.isGroupMsg || message.from.endsWith('@g.us');

      if (isFromGroup) {
        logger.debug(`📢 Received message from group: ${message.from}`);

        // Try to get chat name for verification
        let isClientesGroup = false;
        try {
          const chat = await message.getChat();
          isClientesGroup = chat.name?.toLowerCase().includes('clientes');
          logger.debug(`📢 Group chat name: "${chat.name}", isClientes: ${isClientesGroup}`);
        } catch (chatError) {
          logger.debug(`⚠️ Could not get chat name: ${chatError.message}`);
          // Fallback: check if it's the configured Clientes group ID
          isClientesGroup = message.from === process.env.WHATSAPP_CLIENTES_GROUP_ID;
          logger.debug(`📢 Using fallback check: isClientes: ${isClientesGroup}`);
        }

        if (isClientesGroup && message.body) {
          const msgLower = message.body.toLowerCase();
          logger.info(`📢 Group message in "Clientes": "${message.body.substring(0, 50)}..."`);

          // Check for advisor claiming chat (formato: "atiende [nombre] [teléfono]")
          if (hasAssignmentMessage(msgLower)) {
            logger.info(`✅ Detected "atiende" in group message`);
            const { advisorName, phone: clientPhone } = extractAdvisorAndPhone(message.body);
            logger.debug(`🔍 Extracted advisor name: "${advisorName}", phone: "${clientPhone}"`);

            if (advisorName && clientPhone) {
              logger.info(`✅ Advisor: "${advisorName}", Client Phone: "${clientPhone}"`);

              try {
                // Search for reservation by phone
                const reservation = await getReservationByPhone(clientPhone);
                if (!reservation) {
                  logger.warn(`⚠️ No reservation found for phone: ${clientPhone}`);
                  try {
                    await message.reply(`⚠️ No se encontró reserva para el cliente ${clientPhone}`);
                  } catch (replyError) {
                    logger.debug(`Failed to send error reply`, replyError);
                  }
                  return;
                }

                logger.info(`✅ Found reservation ID: ${reservation.id}, Lead: ${reservation.lead_id}`);
                const claimed = await claimChatAssignment(reservation.id, advisorName);
                if (claimed) {
                  logger.info(`✅ Successfully claimed chat for ${advisorName}`);
                  try {
                    await message.reply(`✅ Cliente ${clientPhone} (${reservation.client_name}) ya está siendo atendido por ${advisorName}`);
                  } catch (error) {
                    logger.debug(`Failed to reply in group`, error);
                  }
                } else {
                  logger.warn(`⚠️ Failed to claim chat - API returned false`);
                }
              } catch (claimError) {
                logger.warn(`⚠️ Cannot claim client: ${claimError.message}`);
                let errorMsg = `⚠️ Cliente ${clientPhone} ya está siendo atendido. No se puede reasignar.`;

                // Check if it's a specific error about client already being served
                if (claimError.message && claimError.message.includes('already being served by')) {
                  const match = claimError.message.match(/already being served by (\w+)/);
                  if (match) {
                    errorMsg = `⚠️ Cliente ${clientPhone} ya está siendo atendido por ${match[1]}. No se puede reasignar.`;
                  }
                }

                try {
                  await message.reply(errorMsg);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ Could not extract complete info from: "${message.body}"`);
              logger.info(`💡 Extracted - Name: "${advisorName}", Phone: "${clientPhone}"`);
              logger.info(`💡 Format should be: "atiende valentina 3245184132"`);
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for advisor releasing chat
          if (msgLower.includes('liberar')) {
            logger.info(`✅ Detected "liberar" in group message`);

            // Extract phone if provided: "liberar 3017551147"
            const phoneMatch = message.body.match(/liberar\s+(\+?\d{10,})/i);
            const clientPhone = phoneMatch ? phoneMatch[1] : null;
            logger.debug(`🔍 Extracted client phone: "${clientPhone}"`);

            if (clientPhone) {
              logger.info(`✅ Releasing chat for client: ${clientPhone}`);

              try {
                // Search for reservation by phone
                const reservation = await getReservationByPhone(clientPhone);
                if (!reservation) {
                  logger.warn(`⚠️ No reservation found for phone: ${clientPhone}`);
                  try {
                    await message.reply(`⚠️ No se encontró reserva para el cliente ${clientPhone}`);
                  } catch (replyError) {
                    logger.debug(`Failed to send error reply`, replyError);
                  }
                  return;
                }

                logger.info(`✅ Found reservation ID: ${reservation.id}`);
                const released = await releaseChatAssignment(reservation.id);
                if (released) {
                  logger.info(`✅ Successfully released chat`);
                  try {
                    await message.reply(`✅ Cliente ${clientPhone} (${reservation.client_name}) liberado`);
                  } catch (error) {
                    logger.debug(`Failed to reply in group`, error);
                  }
                } else {
                  logger.warn(`⚠️ Failed to release chat - API returned false`);
                }
              } catch (releaseError) {
                logger.warn(`⚠️ Error releasing chat: ${releaseError.message}`);
                try {
                  await message.reply(`⚠️ Error al liberar el cliente ${clientPhone}`);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ Could not extract phone from: "${message.body}"`);
              logger.info(`💡 Format should be: "liberar 3017551147"`);
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "listar bloqueados" command (must check before "bloquear")
          if (msgLower.includes('listar bloqueados')) {
            logger.info(`✅ Detected "listar bloqueados" command`);
            try {
              const blocked = await listBlocked();
              if (blocked.length === 0) {
                await message.reply('✅ No hay números bloqueados actualmente.');
              } else {
                const list = blocked.map(c => `• ${c.contact_name || 'Sin nombre'} - ${c.phone_number}`).join('\n');
                await message.reply(`🚫 *Números bloqueados:*\n\n${list}`);
              }
            } catch (error) {
              logger.error(`Error listing blocked contacts: ${error.message}`);
              try {
                await message.reply('⚠️ Error al listar bloqueados.');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "desbloquear" command (must check before "bloquear" since it contains it)
          if (msgLower.includes('desbloquear')) {
            logger.info(`✅ Detected "desbloquear" command`);

            const phoneMatch = message.body.match(/desbloquear\s+(\+?\d{10,})/i);
            const clientPhone = phoneMatch ? phoneMatch[1] : null;
            logger.debug(`🔍 Extracted client phone: "${clientPhone}"`);

            if (clientPhone) {
              try {
                const contact = await unblockByPhone(clientPhone);
                if (contact) {
                  await message.reply(`✅ Cliente ${clientPhone} (${contact.contact_name || 'Sin nombre'}) desbloqueado. Ya puede recibir respuestas del bot.`);
                } else {
                  await message.reply(`⚠️ No se encontró un contacto con el número ${clientPhone}. Debe haber escrito al bot al menos una vez.`);
                }
              } catch (error) {
                logger.error(`Error unblocking: ${error.message}`);
                try {
                  await message.reply(`⚠️ Error al desbloquear el cliente ${clientPhone}`);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ Could not extract phone from: "${message.body}"`);
              logger.info(`💡 Format should be: "desbloquear 3017551147"`);
              try {
                await message.reply('⚠️ Formato incorrecto. Usa: "desbloquear [número]"');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "bloquear" command (formato: "bloquear [teléfono]")
          if (msgLower.includes('bloquear')) {
            logger.info(`✅ Detected "bloquear" command`);

            const phoneMatch = message.body.match(/bloquear\s+(\+?\d{10,})/i);
            const clientPhone = phoneMatch ? phoneMatch[1] : null;
            logger.debug(`🔍 Extracted client phone: "${clientPhone}"`);

            if (clientPhone) {
              try {
                const contact = await blockByPhone(clientPhone);
                if (contact) {
                  await message.reply(`🚫 Cliente ${clientPhone} (${contact.contact_name || 'Sin nombre'}) bloqueado. El bot dejará de responderle.`);
                } else {
                  await message.reply(`⚠️ No se encontró un contacto con el número ${clientPhone}. Debe haber escrito al bot al menos una vez antes de poder bloquearlo.`);
                }
              } catch (error) {
                logger.error(`Error blocking: ${error.message}`);
                try {
                  await message.reply(`⚠️ Error al bloquear el cliente ${clientPhone}`);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ Could not extract phone from: "${message.body}"`);
              logger.info(`💡 Format should be: "bloquear 3017551147"`);
              try {
                await message.reply('⚠️ Formato incorrecto. Usa: "bloquear [número]"');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "pendientes" command - lists reservations with no advisor assignment yet
          if (msgLower.includes('pendientes')) {
            logger.info(`✅ Detected "pendientes" command`);

            try {
              const pending = await getPendingReservations();

              if (pending.length === 0) {
                await message.reply('✅ No hay órdenes pendientes por asignar.');
              } else {
                const list = pending.map((r, i) =>
                  `${i + 1}. *${r.client_name || 'Sin nombre'}* - ${r.client_phone || 'Sin teléfono'}\n   📍 ${r.destination || 'N/A'} | 🗓️ ${r.dates || 'N/A'}\n   🕐 ${r.created_at}`
                ).join('\n\n');

                await message.reply(`📋 *ÓRDENES PENDIENTES (${pending.length}):*\n\n${list}`);
              }
            } catch (error) {
              logger.error(`Error getting pending reservations: ${error.message}`);
              try {
                await message.reply('⚠️ Error al obtener órdenes pendientes.');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "atendidos" command - lists chats currently being served by an advisor
          if (msgLower.includes('atendidos')) {
            logger.info(`✅ Detected "atendidos" command`);

            try {
              const active = await getActiveAssignmentsWithDetails();

              if (active.length === 0) {
                await message.reply('✅ No hay ningún cliente siendo atendido en este momento.');
              } else {
                const list = active.map((a, i) =>
                  `${i + 1}. *${a.client_name || 'Sin nombre'}* - ${a.client_phone || 'Sin teléfono'}\n   📍 ${a.destination || 'N/A'}\n   👤 Asesor: ${a.intranet_username}\n   🕐 Desde: ${a.taken_at}`
                ).join('\n\n');

                await message.reply(`🟢 *CLIENTES SIENDO ATENDIDOS (${active.length}):*\n\n${list}`);
              }
            } catch (error) {
              logger.error(`Error getting active assignments: ${error.message}`);
              try {
                await message.reply('⚠️ Error al obtener clientes atendidos.');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "liberate all" command - releases all active assignments
          if (msgLower === 'liberate all') {
            logger.info(`✅ Detected "liberate all" command`);

            try {
              const result = await releaseAllAssignments();
              const responseMsg = `🎉 *LIBERACIÓN MASIVA COMPLETADA*\n✅ Liberados: ${result.released}\n❌ Errores: ${result.failed}`;

              try {
                await message.reply(responseMsg);
              } catch (replyError) {
                logger.debug(`Failed to send liberate all reply`, replyError);
              }
            } catch (error) {
              logger.error(`Error releasing all assignments: ${error.message}`);
              try {
                await message.reply(`⚠️ Error al liberar todos los clientes: ${error.message}`);
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for info command (formato: "info [teléfono]")
          if (msgLower.includes('info')) {
            logger.info(`✅ Detected "info" command in group message`);

            // Extract phone: "info 3245184132"
            const phoneMatch = message.body.match(/info\s+(\+?\d{10,})/i);
            const clientPhone = phoneMatch ? phoneMatch[1] : null;
            logger.debug(`🔍 Extracted client phone: "${clientPhone}"`);

            if (clientPhone) {
              logger.info(`✅ Getting info for client: ${clientPhone}`);

              try {
                // Search for most recent reservation by phone
                const reservation = await getReservationByPhone(clientPhone);
                if (!reservation) {
                  logger.warn(`⚠️ No reservation found for phone: ${clientPhone}`);
                  try {
                    await message.reply(`⚠️ No se encontró reserva para el cliente ${clientPhone}`);
                  } catch (replyError) {
                    logger.debug(`Failed to send error reply`, replyError);
                  }
                  return;
                }

                logger.info(`✅ Found reservation ID: ${reservation.id}`);

                // Format and send reservation info
                const infoMsg = `📋 **INFORMACIÓN DE RESERVA**

👤 *Nombre:* ${reservation.client_name || 'N/A'}
📱 *Contacto:* ${reservation.client_phone || 'N/A'}
📍 *Destino:* ${reservation.destination || 'N/A'}
🗓️ *Fechas:* ${reservation.dates || 'N/A'}
👥 *Pasajeros:* ${reservation.passengers || 'N/A'}
🏨 *Habitación:* ${reservation.room_type || 'N/A'}
💰 *Precio:* ${reservation.price || 'N/A'}`;

                try {
                  await message.reply(infoMsg);
                } catch (error) {
                  logger.debug(`Failed to send info reply`, error);
                }
              } catch (infoError) {
                logger.warn(`⚠️ Error getting reservation info: ${infoError.message}`);
                try {
                  await message.reply(`⚠️ Error al obtener información: ${infoError.message}`);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ No phone number provided in info command`);
              logger.info(`💡 Format should be: "info 3245184132"`);
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Debug command: list all tracked chats
          if (msgLower.includes('getchats')) {
            const chatsList = Array.from(activeChats.entries()).map(([id, chat]) => ({
              id,
              name: chat.name || 'Unknown'
            }));

            const debugMsg = `📊 **CHATS RASTREADOS**\n\nTotal: ${activeChats.size}\n\n${
              chatsList.length > 0
                ? chatsList.map((c, i) => `${i + 1}. ${c.name} (${c.id})`).join('\n')
                : 'No hay chats rastreados aún'
            }`;

            try {
              await message.reply(debugMsg);
            } catch (error) {
              logger.debug(`Failed to send getChats reply`, error);
            }

            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for broadcast command (formato: "difusion [mensaje]")
          // Check FIRST for difusionPendientes to avoid matching just "difusion"
          if (msgLower.match(/difusionpendientes\s+/i)) {
            logger.info(`✅ Detected "difusionPendientes" command in group message`);

            // Extract message after "difusionPendientes": "difusionPendientes Hola a todos"
            const pendientesMatch = message.body.match(/difusionPendientes\s+(.*)/i);
            const broadcastMsg = pendientesMatch ? pendientesMatch[1].trim() : null;

            if (broadcastMsg) {
              logger.info(`📢 Broadcasting to PENDING clients (no reservation): "${broadcastMsg}"`);

              try {
                // Use tracked chats from activeChats Map
                const allChats = Array.from(activeChats.values());
                logger.info(`✅ Found ${allChats.length} total chats`);

                // Get all lead_ids that have reservations
                const reservedLeads = await db.getAll(
                  'SELECT DISTINCT lead_id FROM chat_reservations'
                );
                const reservedLeadIds = new Set(reservedLeads.map(r => r.lead_id));
                logger.info(`📊 Found ${reservedLeadIds.size} clients with reservations`);

                let successCount = 0;
                let failureCount = 0;
                let skippedCount = 0;

                // Send message only to chats without reservation
                for (const chat of allChats) {
                  // Skip the admin group itself
                  if (chat.id._serialized === message.from) {
                    logger.debug(`Skipping admin group`);
                    skippedCount++;
                    continue;
                  }

                  // Check if this chat has a reservation
                  if (reservedLeadIds.has(chat.id._serialized)) {
                    logger.debug(`Skipping ${chat.name || chat.id._serialized} - has reservation`);
                    skippedCount++;
                    continue;
                  }

                  // Send only to clients WITHOUT reservation
                  const result = await sendMessageToChatId(chat.id._serialized, broadcastMsg, 1500);
                  if (result.success) {
                    successCount++;
                    logger.debug(`✅ Sent to ${result.name} (PENDING)`);
                  } else {
                    failureCount++;
                    logger.warn(`⚠️ Failed to send to ${result.name}: ${result.error}`);
                  }
                }

                // Send summary to admin group
                const summary = `✅ *DIFUSIÓN A PENDIENTES COMPLETADA*\n📤 Enviados: ${successCount}\n❌ Fallos: ${failureCount}\n⏭️ Saltados (con reserva): ${skippedCount}\n📊 Total: ${allChats.length}`;
                try {
                  await message.reply(summary);
                } catch (replyError) {
                  logger.debug(`Failed to send summary`, replyError);
                }

                logger.info(`🛑 Returning early to avoid Claude processing`);
                return;
              } catch (broadcastError) {
                logger.error(`⚠️ Error sending broadcast to pending: ${broadcastError.message}`);
                try {
                  await message.reply(`⚠️ Error en la difusión a pendientes: ${broadcastError.message}`);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ No message provided in difusionPendientes command`);
              logger.info(`💡 Format should be: "difusionPendientes Disculpa la tardanza, ¿cómo te podemos ayudar?"`);
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for regular difusion (to ALL chats)
          if (msgLower.match(/difusion\s+/i)) {
            logger.info(`✅ Detected "difusion" command in group message`);

            // Extract message after "difusion": "difusion Hola a todos"
            const diffusionMatch = message.body.match(/difusion\s+(.*)/i);
            const broadcastMsg = diffusionMatch ? diffusionMatch[1].trim() : null;

            if (broadcastMsg) {
              logger.info(`📢 Broadcasting message to all chats: "${broadcastMsg}"`);

              try {
                // Use tracked chats from activeChats Map
                const allChats = Array.from(activeChats.values());
                logger.info(`✅ Found ${allChats.length} chats to send broadcast`);

                let successCount = 0;
                let failureCount = 0;

                // Send message to each chat (except the admin group)
                for (const chat of allChats) {
                  // Skip the admin group itself
                  if (chat.id._serialized === message.from) {
                    logger.debug(`Skipping admin group`);
                    continue;
                  }

                  const result = await sendMessageToChatId(chat.id._serialized, broadcastMsg, 1500);
                  if (result.success) {
                    successCount++;
                    logger.debug(`✅ Sent to ${result.name}`);
                  } else {
                    failureCount++;
                    logger.warn(`⚠️ Failed to send to ${result.name}: ${result.error}`);
                  }
                }

                // Send summary to admin group
                const summary = `✅ *DIFUSIÓN COMPLETADA*\n📤 Enviados: ${successCount}\n❌ Fallos: ${failureCount}\n📊 Total: ${allChats.length - 1}`;
                try {
                  await message.reply(summary);
                } catch (replyError) {
                  logger.debug(`Failed to send summary`, replyError);
                }

                logger.info(`🛑 Returning early to avoid Claude processing`);
                return;
              } catch (broadcastError) {
                logger.error(`⚠️ Error sending broadcast: ${broadcastError.message}`);
                try {
                  await message.reply(`⚠️ Error en la difusión: ${broadcastError.message}`);
                } catch (replyError) {
                  logger.debug(`Failed to send error reply`, replyError);
                }
              }
            } else {
              logger.warn(`⚠️ No message provided in difusion command`);
              logger.info(`💡 Format should be: "difusion Hola a todos, disculpen la tardanza"`);
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "claude down" command
          if (msgLower.includes('claude down')) {
            logger.info(`✅ Detected "claude down" command`);
            try {
              stateManager.saveState({ claudeEnabled: false });
              await message.reply('🔴 Claude ha sido desactivado. El bot no responderá mensajes.');
            } catch (error) {
              logger.error(`Error disabling Claude: ${error.message}`);
              try {
                await message.reply('⚠️ Error al desactivar Claude.');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

          // Check for "claude activate" command
          if (msgLower.includes('claude activate')) {
            logger.info(`✅ Detected "claude activate" command`);
            try {
              stateManager.saveState({ claudeEnabled: true });
              await message.reply('✅ Claude ha sido activado. El bot responderá mensajes.');
            } catch (error) {
              logger.error(`Error enabling Claude: ${error.message}`);
              try {
                await message.reply('⚠️ Error al activar Claude.');
              } catch (replyError) {
                logger.debug(`Failed to send error reply`, replyError);
              }
            }
            logger.info(`🛑 Returning early to avoid Claude processing`);
            return;
          }

        }

        // Ignore other group messages
        logger.debug(`🛑 Ignoring group message (not from Clientes or no recognized command)`);
        return;
      }

      // Media/Audio handling
      if (message.hasMedia) {
        logger.info(`📎 Media message from ${message.from} (not supported)`);
        try {
          await message.reply('Los audios y archivos no están soportados por ahora. Por favor, envía un mensaje de texto.');
        } catch (replyError) {
          logger.error(`Failed to send media not supported message`, replyError);
        }
        return;
      }

      // Text message handling (existing flow)
      if (!message.body?.trim()) {
        return;
      }

      logger.info(`📨 Message from ${message.from}: "${message.body}"`);

      // Save or update contact info
      try {
        const contact = await message.getContact();
        let realPhone = contact?.number || null;

        // For @lid contacts, contact.number is NOT the real phone (it's just the lid's
        // numeric part, hidden for privacy). Resolve the real phone via WhatsApp's
        // internal lid<->phone mapping.
        if (message.from.endsWith('@lid')) {
          try {
            const [resolved] = await client.getContactLidAndPhone([message.from]);
            if (resolved?.pn) {
              // pn comes as "521234567890@c.us" - extract just the digits
              realPhone = resolved.pn.split('@')[0];
              logger.debug(`🔎 Resolved real phone for ${message.from}: ${realPhone}`);
            }
          } catch (lidError) {
            logger.debug(`Could not resolve real phone for ${message.from}: ${lidError.message}`);
          }
        }

        if (contact) {
          await saveOrUpdateContact(message.from, realPhone, contact.name);
        }
      } catch (error) {
        logger.debug(`Could not save contact info: ${error.message}`);
      }

      // Check if this lead is blocked - if so, silently ignore the message
      try {
        const blocked = await isBlocked(message.from);
        if (blocked) {
          logger.info(`🚫 Ignoring message from blocked contact: ${message.from}`);
          return;
        }
      } catch (error) {
        logger.debug(`Could not check blocked status: ${error.message}`);
      }

      // Track this chat for broadcast purposes (store by message.from ID)
      try {
        activeChats.set(message.from, { id: { _serialized: message.from }, name: null });
        logger.debug(`✅ Chat ID tracked for broadcast: ${message.from}`);
      } catch (error) {
        logger.debug(`Could not track chat: ${error.message}`);
      }

      // Check chat history for advisor commands (from other sessions)
      logger.info(`🔍 Checking chat history for advisor commands...`);
      const commandResult = await checkForAdvisorCommandsInChat(message);

      if (commandResult) {
        logger.info(`✅ Advisor command detected from chat history: ${commandResult.action}`);
        if (commandResult.action === 'claimed') {
          try {
            await message.reply(`✅ Chat asignado a ${commandResult.advisorName}. Procediendo con la reserva...`);
            logger.info(`✅ Claim acknowledgment sent`);
          } catch (error) {
            logger.debug(`Failed to send claim acknowledgment`, error);
          }
        } else if (commandResult.action === 'released') {
          try {
            await message.reply('✅ Chat liberado. El cliente puede escribir de nuevo.');
            logger.info(`✅ Release acknowledgment sent`);
          } catch (error) {
            logger.debug(`Failed to send release acknowledgment`, error);
          }
        }
        return;
      }

      // Check if current message contains advisor commands (same session)
      logger.debug(`Checking current message for "está siendo atendido por"...`);
      if (isAdvisorClaimingChat(message.body)) {
        logger.info(`🔄 DETECTED: Advisor claiming chat in current message`);
        const advisorName = extractAdvisorName(message.body);
        logger.info(`🔄 Extracted advisor name: "${advisorName}"`);

        if (advisorName) {
          logger.info(`✅ Claiming chat for advisor: ${advisorName}`);
          const claimed = await claimChatAssignment(message.from, advisorName);

          if (claimed) {
            try {
              await message.reply('✅ Chat asignado a ' + advisorName + '. Procediendo con la reserva...');
              logger.info(`✅ Claim acknowledgment sent`);
            } catch (error) {
              logger.debug(`Failed to send claim acknowledgment`, error);
            }
            return;
          }
        }
      }

      // Check if current message contains release command (same session)
      logger.debug(`Checking current message for "fue un gusto atenderte"...`);
      if (isAdvisorReleasingChat(message.body)) {
        logger.info(`✅ DETECTED: Advisor releasing chat in current message`);
        const released = await releaseChatAssignment(message.from);

        if (released) {
          try {
            await message.reply('✅ Chat liberado. El cliente puede escribir de nuevo.');
            logger.info(`✅ Release acknowledgment sent`);
          } catch (error) {
            logger.debug(`Failed to send release acknowledgment`, error);
          }
          return;
        }
      }

      // Check if Claude is enabled
      const state = stateManager.loadState();
      if (!state.claudeEnabled) {
        logger.debug(`Claude is disabled (claude down), ignoring message from ${message.from}`);
        return;
      }

      // Call Claude to get response with user ID for conversation history
      const response = await callClaude(message.body, message.from);

      // If response is null, client is being served by advisor - don't respond
      if (!response) {
        logger.debug(`🤐 No response sent - client is being served by advisor`);
        return;
      }

      logger.debug(`Claude response ready: text="${response.text}", images=${response.imagePaths?.length || 0}`);

      // Extract text from response
      const responseText = response.text || response; // Fallback for backward compatibility
      const destination = response.destination;

      if (destination) {
        logger.info(`Bot enriched response with context from destination: ${destination}`);
      }

      // Send response text
      logger.debug(`Attempting to send message to ${message.from}`);

      try {
        await message.reply(responseText);
        logger.info(`✅ Response sent to ${message.from}`);
      } catch (sendError) {
        logger.error(`Failed to send via reply(): ${sendError.message}`);
        logger.debug(`Send error details:`, sendError);

        // Try alternative send method
        try {
          const chat = await message.getChat();
          await chat.sendMessage(responseText);
          logger.info(`✅ Response sent to ${message.from} (via chat)`);
        } catch (chatError) {
          logger.error(`Failed to send via chat.sendMessage(): ${chatError.message}`);
          logger.debug(`Chat send error details:`, chatError);
        }
      }

      // Send destination images, if any were loaded for this destination
      if (response.imagePaths && response.imagePaths.length > 0) {
        logger.debug(`📷 Sending ${response.imagePaths.length} image(s) to ${message.from}`);
        for (const imagePath of response.imagePaths) {
          try {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(message.from, media);
            logger.debug(`✅ Sent image: ${imagePath}`);
          } catch (imageError) {
            logger.error(`Failed to send image ${imagePath}: ${imageError.message}`);
          }
        }
      }

    } catch (error) {
      logger.error(`Failed to process message from ${message.from}`, error);
      try {
        await message.reply('Disculpa, hubo un error. Intenta de nuevo.');
      } catch (replyError) {
        logger.error(`Failed to send error message`, replyError);
      }
    }
  });

  // Initialize client
  logger.info('Initializing WhatsApp client...');
  await client.initialize();
  logger.info('🎧 Bot is listening for messages...');

  return client;
}

function getClient() {
  if (!client) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return client;
}

module.exports = { initializeClient, getClient };
