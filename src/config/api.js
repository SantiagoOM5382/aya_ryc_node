const logger = require('../utils/logger.js');

// API URL configuration - dinamically set based on environment
const API_URL = process.env.API_URL || `http://localhost:${process.env.API_PORT || 3000}`;

logger.info(`📡 API Base URL configured: ${API_URL}`);

module.exports = {
  API_URL,
  endpoints: {
    chatAssignments: `${API_URL}/api/chat-assignments`,
    claimChat: (chatReservationId) => `${API_URL}/api/chat-assignments/${chatReservationId}/claim`,
    releaseChat: (chatReservationId) => `${API_URL}/api/chat-assignments/${chatReservationId}/release`,
    checkAvailable: (chatReservationId) => `${API_URL}/api/chat-assignments/${chatReservationId}/available`,
    activeChats: `${API_URL}/api/chat-assignments/active`,
    advisorStats: (advisorName) => `${API_URL}/api/advisors/${advisorName}/stats`
  }
};
