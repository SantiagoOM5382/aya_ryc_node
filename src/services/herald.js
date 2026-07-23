const logger = require('../utils/logger.js');

const HERALD_BASE_URL = process.env.HERALD_URL || 'http://ec2-54-165-203-255.compute-1.amazonaws.com';
const HERALD_QR_ENDPOINT = '/herald/v1/whatsapp/qr';

async function sendQREmail(email, qrBase64) {
  try {
    const payload = {
      to: email,
      qr_base64: qrBase64
    };

    const response = await fetch(`${HERALD_BASE_URL}${HERALD_QR_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:4200'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Herald returned ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    logger.info(`✅ QR email sent to ${email} via Herald`);
    return result;
  } catch (error) {
    logger.error(`❌ Failed to send QR email: ${error.message}`);
    throw error;
  }
}

module.exports = {
  sendQREmail
};
