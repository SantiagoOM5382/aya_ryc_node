const express = require('express');
const db = require('./db/database.js');
const chatAssignmentRoutes = require('./routes/chatAssignmentRoutes.js');
const logger = require('./utils/logger.js');

const app = express();
const API_PORT = process.env.API_PORT || 3000;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'API is running' });
});

// API Routes
app.use('/api', chatAssignmentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('API error', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start API server
async function startAPI() {
  try {
    // Test database connection
    await db.testConnection();

    // Start server
    app.listen(API_PORT, () => {
      logger.info(`✅ API server running on http://localhost:${API_PORT}`);
      logger.info(`📊 Available endpoints:`);
      logger.info(`  POST   /api/chat-assignments`);
      logger.info(`  GET    /api/chat-assignments/:userId`);
      logger.info(`  PUT    /api/chat-assignments/:userId/claim`);
      logger.info(`  PUT    /api/chat-assignments/:userId/release`);
      logger.info(`  GET    /api/chat-assignments/active`);
      logger.info(`  GET    /api/advisors/:advisorName/stats`);
      logger.info(`  GET    /api/chat-assignments/:userId/available`);
    });
  } catch (error) {
    logger.error('Failed to start API server', error);
    process.exit(1);
  }
}

module.exports = { app, startAPI };
