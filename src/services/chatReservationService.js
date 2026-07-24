const db = require('../db/database.js');
const logger = require('../utils/logger.js');
const { getColombiaTimeSQL } = require('../utils/timeHelper.js');

// Parse Claude message to extract reservation details
function parseReservationFromMessage(message) {
  try {
    const lines = message.split('\n');
    const reservation = {};

    for (const line of lines) {
      if (line.includes('*Nombre:*') || line.includes('Nombre:')) {
        const match = line.match(/(?:\*Nombre:\*|Nombre:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.client_name = match[1].trim();
      } else if (line.includes('*Contacto:*') || line.includes('Contacto:')) {
        const match = line.match(/(?:\*Contacto:\*|Contacto:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.client_phone = match[1].trim();
      } else if (line.includes('*Destino:*') || line.includes('Destino:')) {
        const match = line.match(/(?:\*Destino:\*|Destino:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.destination = match[1].trim();
      } else if (line.includes('*Fechas:*') || line.includes('Fechas:')) {
        const match = line.match(/(?:\*Fechas:\*|Fechas:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.dates = match[1].trim();
      } else if (line.includes('*Pasajeros:*') || line.includes('Pasajeros:')) {
        const match = line.match(/(?:\*Pasajeros:\*|Pasajeros:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.passengers = match[1].trim();
      } else if (line.includes('*Habitación:*') || line.includes('*Habitaci') || line.includes('Habitación:')) {
        const match = line.match(/(?:\*Habitaci[óo]n:\*|Habitaci[óo]n:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.room_type = match[1].trim();
      } else if (line.includes('*Precio:*') || line.includes('Precio:')) {
        const match = line.match(/(?:\*Precio[^:]*:\*|Precio[^:]*:)\s*(.+?)(?:\*|$)/);
        if (match) reservation.price = match[1].trim();
      }
    }

    return Object.keys(reservation).length > 0 ? reservation : null;
  } catch (error) {
    logger.error('Error parsing reservation from message', error);
    return null;
  }
}

// Create new chat reservation (always creates new order, allowing multiple per client)
async function createReservation(leadId, reservation, rawMessage) {
  try {
    const nowColombia = getColombiaTimeSQL();

    // Always INSERT new reservation - allows multiple orders per client
    await db.execute(
      `INSERT INTO chat_reservations
       (lead_id, client_phone, client_name, destination, dates, passengers, room_type, price, raw_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId,
        reservation.client_phone || null,
        reservation.client_name || null,
        reservation.destination || null,
        reservation.dates || null,
        reservation.passengers || null,
        reservation.room_type || null,
        reservation.price || null,
        rawMessage,
        nowColombia,
        nowColombia
      ]
    );

    logger.info(`✅ New order created for lead ${leadId}: ${reservation.client_name || 'Unknown'}`);

    // Get the created reservation
    const created = await db.getOne(
      'SELECT id FROM chat_reservations WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    return created;
  } catch (error) {
    logger.error('Error creating reservation', error);
    throw error;
  }
}

// Get reservation by phone (most recent) - returns ALL fields
// Normalizes phone number to handle both +525521063005 and 525521063005 formats
async function getReservationByPhone(clientPhone) {
  try {
    // Normalize: remove +, spaces, dashes, parentheses - keep only digits
    const normalizedPhone = clientPhone.replace(/\D/g, '');

    logger.debug(`Searching reservation for phone: ${clientPhone} (normalized: ${normalizedPhone})`);

    const reservation = await db.getOne(
      `SELECT *
       FROM chat_reservations
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(client_phone, '+', ''), ' ', ''), '-', ''), '(', '') = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedPhone]
    );

    return reservation;
  } catch (error) {
    logger.error('Error getting reservation by phone', error);
    throw error;
  }
}

// Get MOST RECENT reservation by lead_id
async function getReservationByLeadId(leadId) {
  try {
    const reservation = await db.getOne(
      `SELECT * FROM chat_reservations
       WHERE lead_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [leadId]
    );

    return reservation;
  } catch (error) {
    logger.error('Error getting reservation by lead_id', error);
    throw error;
  }
}

// Get all reservations that don't have a chat_assignment yet (never claimed by an advisor)
async function getPendingReservations() {
  try {
    const reservations = await db.query(
      `SELECT r.id, r.lead_id, r.client_name, r.client_phone, r.destination, r.dates, r.created_at
       FROM chat_reservations r
       LEFT JOIN chat_assignments a ON a.chat_reservation_id = r.id
       WHERE a.id IS NULL
       ORDER BY r.created_at ASC`,
      []
    );

    return reservations;
  } catch (error) {
    logger.error('Error getting pending reservations', error);
    throw error;
  }
}

// Get completed orders (last 50 with advisor info)
async function getCompletedOrders() {
  try {
    return await db.query(
      `SELECT a.id, r.client_name, r.client_phone, r.destination, a.intranet_username AS advisor, a.duration_minutes, a.completed_at
       FROM chat_reservations r
       JOIN chat_assignments a ON a.chat_reservation_id = r.id
       WHERE a.state = 'completed'
       ORDER BY a.completed_at DESC
       LIMIT 50`,
      []
    );
  } catch (error) {
    logger.error('Error getting completed orders', error);
    throw error;
  }
}

// Get taken orders (currently active assignments)
async function getTakenOrders() {
  try {
    return await db.query(
      `SELECT a.id, r.client_name, r.client_phone, r.destination, a.intranet_username AS advisor, a.taken_at
       FROM chat_reservations r
       JOIN chat_assignments a ON a.chat_reservation_id = r.id
       WHERE a.state = 'taken'
       ORDER BY a.taken_at ASC`,
      []
    );
  } catch (error) {
    logger.error('Error getting taken orders', error);
    throw error;
  }
}

module.exports = {
  parseReservationFromMessage,
  createReservation,
  getReservationByPhone,
  getReservationByLeadId,
  getPendingReservations,
  getCompletedOrders,
  getTakenOrders
};
