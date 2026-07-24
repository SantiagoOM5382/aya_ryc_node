const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger.js');
const { addMessage, getHistory } = require('../state/conversationHistory.js');
const {
  isReadyForTransfer,
  addTransferReadyIndicator,
  logTransferReady,
  updateTransferState,
  getReadyForTransferChats
} = require('../tracker/advisorTransferTracker.js');
const { sendNotificationToAdvisors } = require('../whatsapp/advisorNotifier.js');
const { endpoints } = require('../../config/api.js');
const {
  parseReservationFromMessage,
  createReservation,
  getReservationByLeadId
} = require('../../services/chatReservationService.js');
const { isChatAvailableByLeadId, getAdvisorNameByLeadId } = require('../../services/chatAssignmentService.js');
const { getContactByLeadId } = require('../../services/clientContactService.js');

let client = null;

// Destination configuration
const DESTINATIONS = {
  palafitos: {
    name: 'Palafitos',
    file: 'palafitos/palafitos.txt',
    images: 'palafitos/images',
    keywords: ['palafitos', 'bungalows sobre el agua', 'riviera maya', 'maldivas']
  },
  dunbar_rock: {
    name: 'Dumbar Rock',
    file: 'dunbar_rock/dumbar_rock.txt',
    images: 'dunbar_rock/images',
    keywords: ['dumbar rock', 'dumbar', 'honduras', 'roatan']
  },
  cayo_espanto: {
    name: 'Cayo Espanto',
    file: 'cayo_espanto/cayo_espanto.txt',
    images: 'cayo_espanto/images',
    keywords: ['cayo espanto', 'espanto', 'belice']
  },
  aruba: {
    name: 'Aruba Ocean Villas',
    file: 'aruba/aruba.txt',
    images: 'aruba/images',
    keywords: ['aruba', 'ocean villas', 'villas sobre el agua aruba']
  }
};

// Detect which destination is mentioned in a message
function detectDestination(message) {
  const lowerMessage = message.toLowerCase();
  for (const [key, dest] of Object.entries(DESTINATIONS)) {
    for (const keyword of dest.keywords) {
      if (lowerMessage.includes(keyword)) {
        return key;
      }
    }
  }
  return null;
}

// Load destination information from file
function loadDestinationInfo(destinationKey) {
  try {
    const promptPath = path.join(__dirname, '../../..', 'prompts', DESTINATIONS[destinationKey].file);
    const content = fs.readFileSync(promptPath, 'utf-8');
    return content;
  } catch (error) {
    logger.warn(`Failed to load destination info for ${destinationKey}: ${error.message}`);
    return null;
  }
}

// Load images as base64 for Claude API
function loadDestinationImages(destinationKey) {
  const imageDir = DESTINATIONS[destinationKey].images;
  if (!imageDir) return [];

  try {
    const imageDirPath = path.join(__dirname, '../../..', 'prompts', imageDir);
    if (!fs.existsSync(imageDirPath)) return [];

    const files = fs.readdirSync(imageDirPath);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f)).sort();

    return imageFiles.map(file => {
      try {
        const filePath = path.join(imageDirPath, file);
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString('base64');
        const extension = path.extname(file).toLowerCase().slice(1);
        const mimeType = {
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp'
        }[extension] || 'image/jpeg';

        return {
          filename: file,
          base64,
          mimeType,
          filePath: filePath
        };
      } catch (err) {
        logger.warn(`Failed to load image ${file}: ${err.message}`);
        return null;
      }
    }).filter(img => img !== null);
  } catch (error) {
    logger.warn(`Failed to load destination images for ${destinationKey}: ${error.message}`);
    return [];
  }
}

// Load destination images as file paths for WhatsApp
function loadDestinationImagePaths(destinationKey) {
  const images = loadDestinationImages(destinationKey);
  return images.map(img => img.filePath);
}

// Enrich message with destination info and images
function enrichMessageWithDestination(message, destinationKey) {
  const destinationInfo = loadDestinationInfo(destinationKey);
  const images = loadDestinationImages(destinationKey);

  let enrichedContent = [
    {
      type: 'text',
      text: message
    }
  ];

  if (destinationInfo) {
    enrichedContent.push({
      type: 'text',
      text: `\n\n📋 INFORMACIÓN DEL DESTINO:\n${destinationInfo}`
    });
  }

  if (images.length > 0) {
    logger.info(`Loaded ${images.length} image(s) for destination ${destinationKey}`);
    images.forEach(img => {
      enrichedContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType,
          data: img.base64
        }
      });
    });
  }

  return enrichedContent;
}

// Extract reservation data from bot response and format notification
// realPhone (optional): the WhatsApp-resolved phone number, overrides whatever
// the client typed in the "Contacto:" field (which can be garbage/placeholders)
function formatReservationNotification(botResponse, clientNumber, realPhone = null) {
  try {
    // Extract data using standardized patterns (from updated system prompt format)
    const nameMatch = botResponse.match(/\*Nombre:\*\s*([^\n*]+)/);
    const contactMatch = botResponse.match(/\*Contacto:\*\s*([^\n*]+)/);
    const destinyMatch = botResponse.match(/\*Destino:\*\s*([^\n*]+)/);
    const datesMatch = botResponse.match(/\*Fechas:\*\s*([^\n*]+)/);
    const passengersMatch = botResponse.match(/\*Pasajeros:\*\s*([^\n*]+)/);
    const roomMatch = botResponse.match(/\*Habitación:\*\s*([^\n*]+)/);
    const priceMatch = botResponse.match(/\*Precio referencial:\*\s*([^\n*]+)/);
    const notesMatch = botResponse.match(/\*Notas:\*\s*([^\n*]+)/);

    const name = nameMatch ? nameMatch[1].trim() : 'N/A';
    const contact = realPhone || (contactMatch ? contactMatch[1].trim() : clientNumber);
    const destiny = destinyMatch ? destinyMatch[1].trim() : 'N/A';
    const dates = datesMatch ? datesMatch[1].trim() : 'N/A';
    const passengers = passengersMatch ? passengersMatch[1].trim() : 'N/A';
    const room = roomMatch ? roomMatch[1].trim() : 'N/A';
    const price = priceMatch ? priceMatch[1].trim() : 'N/A';
    const notes = notesMatch ? notesMatch[1].trim() : 'Ninguna';

    const notification = `📲 *NUEVO CLIENTE LISTO PARA ATENDER*

👤 *Nombre:* ${name}
📱 *Contacto:* ${contact}
📍 *Destino:* ${destiny}
🗓️ *Fechas:* ${dates}
👥 *Pasajeros:* ${passengers}
🛏️ *Habitación:* ${room}
💰 *Precio referencial:* ${price}
📝 *Notas:* ${notes}`;

    return notification;
  } catch (error) {
    logger.error(`Failed to format reservation notification: ${error.message}`);
    return null;
  }
}

// Extract only the reservation summary (from RESUMEN to end) for database storage
function extractReservationSummary(response) {
  try {
    // Match from "RESUMEN DE RESERVA FINAL" to the end
    const summaryMatch = response.match(/📋 RESUMEN DE RESERVA FINAL[\s\S]*?💰 \*Precio referencial:\*[^\n]*/);
    if (summaryMatch) {
      return summaryMatch[0].trim();
    }
    return null;
  } catch (error) {
    logger.debug(`Failed to extract reservation summary: ${error.message}`);
    return null;
  }
}

// Extract notes from response to send only to advisors
function extractNotesFromResponse(response) {
  try {
    const notesMatch = response.match(/📝 \*Notas:\*\s*([^\n*]+(?:\n(?!📝|👤|📱|📍|🗓️|👥|🏨|💰)[^\n]*)*)/);
    return notesMatch ? notesMatch[1].trim() : null;
  } catch (error) {
    logger.debug(`Failed to extract notes: ${error.message}`);
    return null;
  }
}

// Remove notes from response before sending to client
function removeNotesFromResponse(response) {
  try {
    return response.replace(/\n?📝 \*Notas:\*\s*[^\n*]+(?:\n(?!📝|👤|📱|📍|🗓️|👥|🏨|💰)[^\n]*)*/g, '').trim();
  } catch (error) {
    logger.debug(`Failed to remove notes: ${error.message}`);
    return response;
  }
}

// Load system prompt from file
let systemPrompt = '';
try {
  const promptPath = path.join(__dirname, '../../..', 'prompts', 'ryc-system-prompt.txt');
  systemPrompt = fs.readFileSync(promptPath, 'utf-8');
  logger.info('System prompt loaded successfully');
} catch (error) {
  logger.error('Failed to load system prompt', error);
  process.exit(1);
}

function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120000  // 120 seconds timeout
    });
  }
  return client;
}

// Register or update chat assignment in database
// Note: Chat assignments are now created when advisor claims via group chat
// This function is kept for backwards compatibility but no longer does anything
async function registerChatAssignment(userId, phone, clientName) {
  logger.debug(`Chat assignments are now created via group commands - skipping direct registration`);
}

// Check if chat is available (not being served by an advisor)
async function isChatAvailable(userId) {
  try {
    // Use service layer to check availability via lead ID
    return await isChatAvailableByLeadId(userId);
  } catch (error) {
    logger.debug(`Error checking chat availability: ${error.message}`);
    return true; // Assume available if API is down
  }
}

// Check if user has an active reservation
async function getActiveReservation(userId) {
  try {
    const reservation = await getReservationByLeadId(userId);
    return reservation || null;
  } catch (error) {
    logger.debug(`Error checking active reservation: ${error.message}`);
    return null;
  }
}

// Check if message is requesting a different/new destination
function isNewDestinationRequest(message, currentDestination) {
  const lowerMessage = message.toLowerCase();
  // Check if asking about a different destination
  for (const [key, dest] of Object.entries(DESTINATIONS)) {
    if (key !== currentDestination && dest.keywords.some(kw => lowerMessage.includes(kw))) {
      return true;
    }
  }
  return false;
}

async function callClaude(userMessage, userId) {
  try {
    logger.debug(`Processing message from ${userId}`);
    logger.debug(`Sending message to Claude: "${userMessage}"`);

    // Register chat if not already registered
    await registerChatAssignment(userId, '', 'Customer');

    // Check if user has an active reservation
    const activeReservation = await getActiveReservation(userId);
    if (activeReservation) {
      logger.info(`Active reservation found for ${userId}: ${activeReservation.destination}`);
    }

    // Check if chat is being actively served by an advisor (state = 'taken')
    const available = await isChatAvailable(userId);
    if (!available) {
      // Chat is assigned to advisor - don't respond, client is being served
      logger.info(`🤐 Silencing response - client ${userId} is being served by advisor`);
      return null;
    }

    // If reservation is completed but no advisor assigned yet, allow client to continue chatting
    if (activeReservation && activeReservation.state === 'completed') {
      logger.info(`Reservation completed, awaiting advisor assignment. Allowing client to continue.`);
    }

    // Detect if user is asking about a specific destination
    const destinationKey = detectDestination(userMessage);
    if (destinationKey) {
      logger.info(`Destination detected: ${destinationKey}`);
    }

    // Determine if this is a new destination request (when reservation exists)
    const isNewRequest = activeReservation && destinationKey && isNewDestinationRequest(userMessage, activeReservation.destination);
    if (isNewRequest) {
      logger.info(`New destination request detected from returning customer`);
    }

    // Build enhanced system prompt if reservation exists and not requesting new destination
    let enhancedSystemPrompt = systemPrompt;
    if (activeReservation && !isNewRequest) {
      enhancedSystemPrompt += `\n\n⚠️ CONTEXTO: Este cliente ya tiene una reserva activa en ${activeReservation.destination}.
- Si pregunta sobre su reserva: remítelo al asesor
- Si pregunta algo general: responde normalmente
- Si pide otro destino: inicia nuevo flujo`;
    }

    // Track user message in history
    addMessage(userId, 'user', userMessage);
    const history = getHistory(userId);

    // Build messages with enriched content if destination detected
    let messagesForClaude = history;
    if (destinationKey) {
      messagesForClaude = history.map((msg, idx) => {
        if (idx === history.length - 1 && msg.role === 'user') {
          return {
            role: 'user',
            content: enrichMessageWithDestination(msg.content, destinationKey)
          };
        }
        return msg;
      });
    }

    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1000,
      system: enhancedSystemPrompt,
      messages: messagesForClaude
    });

    let responseWithNotes = message.content[0].text;
    logger.debug(`Claude response: "${responseWithNotes}"`);

    // Track assistant response in history (with notes, for internal tracking)
    addMessage(userId, 'assistant', responseWithNotes);

    // Check if chat is ready for transfer to advisor
    // Only add indicator if not already marked as ready for transfer
    const readyForTransfer = isReadyForTransfer(responseWithNotes);
    logger.debug(`isReadyForTransfer check: ${readyForTransfer}`);

    if (readyForTransfer) {
      const readyChats = getReadyForTransferChats();
      const alreadyMarked = readyChats.some(chat => chat.userId === userId && !chat.transferred);
      logger.debug(`User ${userId} alreadyMarked: ${alreadyMarked}`);

      if (!alreadyMarked) {
        logger.info(`🔄 Transfer readiness detected for ${userId}`);
        const timestamp = new Date().toISOString();

        // Get the real WhatsApp-resolved phone number instead of trusting
        // whatever the client typed (placeholders, garbage text, etc.)
        let realPhone = null;
        try {
          const contact = await getContactByLeadId(userId);
          if (contact?.phone_number) {
            realPhone = contact.phone_number;
          }
        } catch (contactError) {
          logger.debug(`Could not fetch real phone for ${userId}: ${contactError.message}`);
        }

        // Parse and save reservation
        try {
          const reservationData = parseReservationFromMessage(responseWithNotes);
          if (reservationData) {
            if (realPhone) {
              reservationData.client_phone = realPhone;
            }

            // Save only the reservation summary to database, not the full message
            const reservationSummary = extractReservationSummary(responseWithNotes) || responseWithNotes;
            await createReservation(userId, reservationData, reservationSummary);
            logger.info(`✅ Reservation saved for ${userId}`);
          }
        } catch (error) {
          logger.error(`Failed to save reservation: ${error.message}`);
        }

        // Log to file (with notes)
        logTransferReady(userId, timestamp, responseWithNotes);

        // Update state file (with notes)
        updateTransferState(userId, timestamp, responseWithNotes);

        // Add visual indicator to response with notes
        const responseWithIndicator = addTransferReadyIndicator(responseWithNotes);

        // Send notification to advisors group (includes notes)
        const notification = formatReservationNotification(responseWithIndicator, userId, realPhone);
        logger.debug(`Formatted notification: ${notification ? 'success' : 'failed'}`);
        if (notification) {
          const notificationSent = await sendNotificationToAdvisors(notification);
          logger.info(`Notification sent to group: ${notificationSent}`);
        }
      }
    }

    // Remove notes from response before sending to client
    const responseForClient = removeNotesFromResponse(responseWithNotes);

    // Prepare response with images if destination detected
    const imagePaths = destinationKey ? loadDestinationImagePaths(destinationKey) : [];

    return {
      text: responseForClient,
      imagePaths: imagePaths,
      destination: destinationKey
    };
  } catch (error) {
    logger.error('Claude API call failed', error);
    // Return fallback message in Spanish
    return {
      text: '¿Podrías enviar el mensaje nuevamente? No pude recibirlo correctamente.',
      imagePaths: [],
      destination: null
    };
  }
}

async function callClaudeWithAudio(audioBase64, mimeType, userId) {
  try {
    logger.debug(`Processing audio from ${userId}, MIME: ${mimeType}`);
    logger.debug(`Audio data length: ${audioBase64.length} chars`);

    // Register chat if not already registered
    await registerChatAssignment(userId, '', 'Customer');

    // Check if user has an active reservation
    const activeReservation = await getActiveReservation(userId);
    if (activeReservation) {
      logger.info(`Active reservation found for audio from ${userId}: ${activeReservation.destination}`);
    }

    // Check if chat is being actively served by an advisor (state = 'taken')
    const available = await isChatAvailable(userId);
    if (!available) {
      // Chat is assigned to advisor - don't respond, client is being served
      logger.info(`🤐 Silencing response - client ${userId} is being served by advisor`);
      return null;
    }

    // If reservation is completed but no advisor assigned yet, allow client to continue chatting
    if (activeReservation && activeReservation.state === 'completed') {
      logger.info(`Reservation completed (audio), awaiting advisor assignment. Allowing client to continue.`);
    }

    // Build enhanced system prompt if reservation exists
    let enhancedSystemPrompt = systemPrompt;
    if (activeReservation) {
      enhancedSystemPrompt += `\n\n⚠️ CONTEXTO: Este cliente ya tiene una reserva activa en ${activeReservation.destination}.
- Si pregunta sobre su reserva: remítelo al asesor
- Si pregunta algo general: responde normalmente
- Si pide otro destino: inicia nuevo flujo`;
    }

    // Track audio message in history
    addMessage(userId, 'user', '[Audio message]');
    const history = getHistory(userId);

    // Build audio content
    let audioContent = [
      {
        type: 'audio',
        media_type: mimeType,
        data: audioBase64
      }
    ];

    // Check conversation history for destination mention to add images
    const lastUserMessage = history.filter(m => m.role === 'user').pop()?.content || '';
    const destinationKey = detectDestination(typeof lastUserMessage === 'string' ? lastUserMessage : JSON.stringify(lastUserMessage));

    if (destinationKey) {
      logger.info(`Destination detected in audio context: ${destinationKey}`);
      const images = loadDestinationImages(destinationKey);
      const destinationInfo = loadDestinationInfo(destinationKey);

      if (destinationInfo) {
        audioContent.push({
          type: 'text',
          text: `\n\n📋 INFORMACIÓN DEL DESTINO:\n${destinationInfo}`
        });
      }

      if (images.length > 0) {
        images.forEach(img => {
          audioContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType,
              data: img.base64
            }
          });
        });
      }
    }

    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1000,
      system: enhancedSystemPrompt,
      messages: [
        ...history.slice(0, -1),
        {
          role: 'user',
          content: audioContent
        }
      ]
    });

    let responseWithNotes = message.content[0].text;
    logger.debug(`Claude audio response: "${responseWithNotes}"`);

    // Track assistant response in history (with notes, for internal tracking)
    addMessage(userId, 'assistant', responseWithNotes);

    // Check if chat is ready for transfer to advisor
    // Only add indicator if not already marked as ready for transfer
    if (isReadyForTransfer(responseWithNotes)) {
      const readyChats = getReadyForTransferChats();
      const alreadyMarked = readyChats.some(chat => chat.userId === userId && !chat.transferred);

      if (!alreadyMarked) {
        logger.info(`🔄 Transfer readiness detected for audio from ${userId}`);
        const timestamp = new Date().toISOString();

        // Get the real WhatsApp-resolved phone number
        let realPhone = null;
        try {
          const contact = await getContactByLeadId(userId);
          if (contact?.phone_number) {
            realPhone = contact.phone_number;
          }
        } catch (contactError) {
          logger.debug(`Could not fetch real phone for ${userId}: ${contactError.message}`);
        }

        // Log to file (with notes)
        logTransferReady(userId, timestamp, responseWithNotes);

        // Update state file (with notes)
        updateTransferState(userId, timestamp, responseWithNotes);

        // Add visual indicator to response with notes
        const responseWithIndicator = addTransferReadyIndicator(responseWithNotes);

        // Send notification to advisors group (includes notes)
        const notification = formatReservationNotification(responseWithIndicator, userId, realPhone);
        if (notification) {
          await sendNotificationToAdvisors(notification);
        }
      }
    }

    // Remove notes from response before sending to client
    const responseForClient = removeNotesFromResponse(responseWithNotes);

    // Prepare response with images if destination detected
    // Check last user message for destination mention in audio context
    const imagePaths = destinationKey ? loadDestinationImagePaths(destinationKey) : [];

    return {
      text: responseForClient,
      imagePaths: imagePaths,
      destination: destinationKey
    };
  } catch (error) {
    logger.error(`Claude audio call failed: ${error.message}`);
    logger.error(`Error details:`, error);
    return {
      text: '¿Podrías enviar el mensaje nuevamente? No pude recibirlo correctamente.',
      imagePaths: [],
      destination: null
    };
  }
}

module.exports = { callClaude, callClaudeWithAudio };
