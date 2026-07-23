const express = require('express');
const router = express.Router();
const chatAssignmentService = require('../services/chatAssignmentService.js');
const logger = require('../utils/logger.js');

// Create or get assignment
// Note: Assignments are now created via group commands, not via direct API calls
router.post('/chat-assignments', async (req, res) => {
  try {
    const { chatReservationId } = req.body;

    if (!chatReservationId) {
      return res.status(400).json({ error: 'chatReservationId is required' });
    }

    const assignment = await chatAssignmentService.getOrCreateAssignment(chatReservationId);

    res.json({ success: true, data: chatAssignmentService.formatAssignmentForResponse(assignment) });
  } catch (error) {
    logger.error('POST /chat-assignments error', error);
    res.status(500).json({ error: error.message });
  }
});

// Get assignment status
router.get('/chat-assignments/:reservationId', async (req, res) => {
  try {
    const assignment = await chatAssignmentService.getAssignment(req.params.reservationId);

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ success: true, data: chatAssignmentService.formatAssignmentForResponse(assignment) });
  } catch (error) {
    logger.error('GET /chat-assignments/:reservationId error', error);
    res.status(500).json({ error: error.message });
  }
});

// Claim assignment (mark as taken by advisor)
router.put('/chat-assignments/:reservationId/claim', async (req, res) => {
  try {
    const { advisorName } = req.body;

    if (!advisorName) {
      return res.status(400).json({ error: 'advisorName is required' });
    }

    const assignment = await chatAssignmentService.claimAssignment(
      req.params.reservationId,
      advisorName
    );

    res.json({ success: true, message: 'Assignment claimed', data: assignment });
  } catch (error) {
    logger.error('PUT /chat-assignments/:reservationId/claim error', error);
    res.status(500).json({ error: error.message });
  }
});

// Release assignment (mark as completed)
router.put('/chat-assignments/:reservationId/release', async (req, res) => {
  try {
    const assignment = await chatAssignmentService.releaseAssignment(req.params.reservationId);

    res.json({ success: true, message: 'Assignment released', data: assignment });
  } catch (error) {
    logger.error('PUT /chat-assignments/:reservationId/release error', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active assignments (currently being served)
router.get('/chat-assignments/active', async (req, res) => {
  try {
    const assignments = await chatAssignmentService.getActiveAssignments();
    const formatted = assignments.map(a => chatAssignmentService.formatAssignmentForResponse(a));

    res.json({ success: true, data: formatted });
  } catch (error) {
    logger.error('GET /chat-assignments/active error', error);
    res.status(500).json({ error: error.message });
  }
});

// Get advisor stats
router.get('/advisors/:advisorName/stats', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const stats = await chatAssignmentService.getAdvisorStats(
      req.params.advisorName,
      dateFrom,
      dateTo
    );

    // Format assignments in stats to Colombia time
    const formatted = {
      ...stats,
      assignments: stats.assignments.map(a => chatAssignmentService.formatAssignmentForResponse(a))
    };

    res.json({ success: true, data: formatted });
  } catch (error) {
    logger.error('GET /advisors/:advisorName/stats error', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if chat is available
router.get('/chat-assignments/:reservationId/available', async (req, res) => {
  try {
    const assignment = await chatAssignmentService.getAssignment(req.params.reservationId);

    if (!assignment) {
      return res.json({ success: true, available: true, advisor: null });
    }

    const available = assignment.state === 'free';
    const advisor = available ? null : assignment.intranet_username;

    res.json({ success: true, available, advisor });
  } catch (error) {
    logger.error('GET /chat-assignments/:reservationId/available error', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
