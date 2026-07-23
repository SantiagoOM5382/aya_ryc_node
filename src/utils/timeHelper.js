const logger = require('./logger.js');

// Get current time in Colombia timezone (America/Bogota = UTC-5)
// Returns format: "2026-07-22 13:18:45" (ready for SQL)
function getColombiaTimeSQL() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date());

    const obj = {};
    parts.forEach(part => obj[part.type] = part.value);
    return `${obj.year}-${obj.month}-${obj.day} ${obj.hour}:${obj.minute}:${obj.second}`;
  } catch (error) {
    logger.error('Error getting Colombia time', error);
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
}

// Get current time in Colombia timezone for display
function getColombiaTimeDisplay() {
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date());
  } catch (error) {
    logger.error('Error getting Colombia time display', error);
    return new Date().toLocaleString();
  }
}

// Convert UTC string to Colombia time string for display
function convertUTCToColombiaDisplay(utcString) {
  try {
    if (!utcString) return null;
    const date = new Date(utcString);
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  } catch (error) {
    logger.error('Error converting UTC to Colombia time', error);
    return utcString;
  }
}

module.exports = {
  getColombiaTimeSQL,
  getColombiaTimeDisplay,
  convertUTCToColombiaDisplay
};
