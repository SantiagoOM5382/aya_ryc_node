const db = require('../db/database.js');
const logger = require('../utils/logger.js');

// Save or update client contact info
async function saveOrUpdateContact(leadId, phoneNumber, contactName) {
  try {
    // MySQL doesn't accept undefined - normalize to null
    const phone = phoneNumber || null;
    const name = contactName || null;

    // Check if contact already exists
    const existing = await db.getOne(
      'SELECT id FROM chat_contacts WHERE lead_id = ?',
      [leadId]
    );

    if (existing) {
      // Update last_message_at
      await db.execute(
        'UPDATE chat_contacts SET last_message_at = NOW(), phone_number = ?, contact_name = ? WHERE lead_id = ?',
        [phone, name, leadId]
      );
      logger.debug(`Updated contact for ${leadId}`);
    } else {
      // Insert new contact
      await db.execute(
        'INSERT INTO chat_contacts (lead_id, phone_number, contact_name) VALUES (?, ?, ?)',
        [leadId, phone, name]
      );
      logger.info(`✅ New contact saved: ${name || 'Sin nombre'} (${phone || 'Sin teléfono'}) - ${leadId}`);
    }
  } catch (error) {
    logger.error('Error saving contact', error);
    // Don't throw - this is non-critical
  }
}

// Get contact by phone number
async function getContactByPhone(phoneNumber) {
  try {
    // Normalize phone: remove +, spaces, dashes
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    const contact = await db.getOne(
      `SELECT id, lead_id, phone_number, contact_name
       FROM chat_contacts
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', ''), '(', '') = ?
       LIMIT 1`,
      [normalizedPhone]
    );

    return contact;
  } catch (error) {
    logger.error('Error getting contact by phone', error);
    return null;
  }
}

// Get contact by lead_id
async function getContactByLeadId(leadId) {
  try {
    const contact = await db.getOne(
      'SELECT * FROM chat_contacts WHERE lead_id = ?',
      [leadId]
    );
    return contact;
  } catch (error) {
    logger.error('Error getting contact by lead_id', error);
    return null;
  }
}

// Block a client by phone number - finds their lead_id and marks as blocked
async function blockByPhone(phoneNumber) {
  try {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    const contact = await db.getOne(
      `SELECT id, lead_id, phone_number, contact_name
       FROM chat_contacts
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', ''), '(', '') = ?
       LIMIT 1`,
      [normalizedPhone]
    );

    if (!contact) {
      logger.warn(`⚠️ No contact found for phone: ${phoneNumber}`);
      return null;
    }

    await db.execute(
      'UPDATE chat_contacts SET is_blocked = 1 WHERE id = ?',
      [contact.id]
    );

    logger.info(`🚫 Blocked contact: ${contact.contact_name} (${contact.phone_number}) - ${contact.lead_id}`);
    return contact;
  } catch (error) {
    logger.error('Error blocking contact by phone', error);
    throw error;
  }
}

// Unblock a client by phone number
async function unblockByPhone(phoneNumber) {
  try {
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    const contact = await db.getOne(
      `SELECT id, lead_id, phone_number, contact_name
       FROM chat_contacts
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone_number, '+', ''), ' ', ''), '-', ''), '(', '') = ?
       LIMIT 1`,
      [normalizedPhone]
    );

    if (!contact) {
      logger.warn(`⚠️ No contact found for phone: ${phoneNumber}`);
      return null;
    }

    await db.execute(
      'UPDATE chat_contacts SET is_blocked = 0 WHERE id = ?',
      [contact.id]
    );

    logger.info(`✅ Unblocked contact: ${contact.contact_name} (${contact.phone_number}) - ${contact.lead_id}`);
    return contact;
  } catch (error) {
    logger.error('Error unblocking contact by phone', error);
    throw error;
  }
}

// Check if a lead_id is blocked
async function isBlocked(leadId) {
  try {
    const contact = await db.getOne(
      'SELECT is_blocked FROM chat_contacts WHERE lead_id = ?',
      [leadId]
    );

    if (!contact) return false;
    return contact.is_blocked === 1;
  } catch (error) {
    logger.error('Error checking if blocked', error);
    return false; // Fail open - don't block on error
  }
}

// List all blocked contacts
async function listBlocked() {
  try {
    const contacts = await db.query(
      'SELECT lead_id, phone_number, contact_name FROM chat_contacts WHERE is_blocked = 1',
      []
    );
    return contacts;
  } catch (error) {
    logger.error('Error listing blocked contacts', error);
    return [];
  }
}

module.exports = {
  saveOrUpdateContact,
  getContactByPhone,
  getContactByLeadId,
  blockByPhone,
  unblockByPhone,
  isBlocked,
  listBlocked
};
