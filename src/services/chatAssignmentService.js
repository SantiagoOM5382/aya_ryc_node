const db = require('../db/database.js');
const logger = require('../utils/logger.js');
const { getColombiaTimeSQL } = require('../utils/timeHelper.js');

// Format date as YYYY-MM-DD (date only)
function getDateOnly(dateString) {
  if (!dateString) return null;
  return dateString.slice(0, 10);
}

// Format assignment for API response (times already stored in Colombia in DB)
function formatAssignmentForResponse(assignment) {
  if (!assignment) return null;
  // Times are already stored in Colombia timezone in the database
  // No conversion needed
  return assignment;
}

// Get or create chat assignment
async function getOrCreateAssignment(chatReservationId) {
  try {
    let assignment = await db.getOne(
      'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
      [chatReservationId]
    );

    if (!assignment) {
      await db.execute(
        'INSERT INTO chat_assignments (chat_reservation_id, state) VALUES (?, "free")',
        [chatReservationId]
      );
      assignment = await db.getOne(
        'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
        [chatReservationId]
      );
      logger.info(`New assignment created for reservation ${chatReservationId}`);
    }

    return assignment;
  } catch (error) {
    logger.error('Error getting or creating assignment', error);
    throw error;
  }
}

// Get assignment by reservation ID
async function getAssignment(chatReservationId) {
  try {
    return await db.getOne(
      'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
      [chatReservationId]
    );
  } catch (error) {
    logger.error('Error getting assignment', error);
    throw error;
  }
}

// Record event in assignment history (save in Colombia time)
async function recordAssignmentHistory(chatReservationId, advisorName, action, durationMinutes = null, startedAt = null, endedAt = null) {
  try {
    await db.execute(
      'INSERT INTO chat_assignment_history (chat_reservation_id, intranet_username, action, duration_minutes, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)',
      [chatReservationId, advisorName || null, action, durationMinutes, startedAt || null, endedAt || null]
    );
    logger.debug(`Recorded history: ${action} for reservation ${chatReservationId} by ${advisorName || 'system'}`);
  } catch (error) {
    logger.error('Error recording assignment history', error);
  }
}

// Claim assignment (mark as taken)
async function claimAssignment(chatReservationId, advisorName) {
  try {
    const nowColombia = getColombiaTimeSQL();

    // First, ensure the assignment exists (create if doesn't exist)
    let assignment = await db.getOne(
      'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
      [chatReservationId]
    );

    if (!assignment) {
      logger.debug(`Creating new assignment for reservation ${chatReservationId}`);
      await db.execute(
        'INSERT INTO chat_assignments (chat_reservation_id, state) VALUES (?, ?)',
        [chatReservationId, 'free']
      );
    } else if (assignment.state === 'taken') {
      // Client is already being served by another advisor
      logger.warn(`Cannot claim reservation ${chatReservationId}: already taken by ${assignment.intranet_username}`);
      throw new Error(`Client is already being served by ${assignment.intranet_username}`);
    }

    // Now claim it (save in Colombia time)
    await db.execute(
      'UPDATE chat_assignments SET state = ?, intranet_username = ?, taken_at = ? WHERE chat_reservation_id = ?',
      ['taken', advisorName, nowColombia, chatReservationId]
    );

    // Record in history (save Colombia time)
    await recordAssignmentHistory(chatReservationId, advisorName, 'claimed', null, nowColombia, null);

    const updated = await db.getOne(
      'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
      [chatReservationId]
    );

    logger.info(`Assignment claimed by ${advisorName} for reservation ${chatReservationId}`);
    return updated;
  } catch (error) {
    logger.error('Error claiming assignment', error);
    throw error;
  }
}

// Release assignment (mark as completed)
async function releaseAssignment(chatReservationId) {
  try {
    const assignment = await db.getOne(
      'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
      [chatReservationId]
    );

    if (!assignment) {
      throw new Error('Assignment not found');
    }

    // Check if assignment was actually claimed (has taken_at)
    if (!assignment.taken_at) {
      logger.warn(`Cannot release reservation ${chatReservationId}: never was claimed by an advisor`);
      throw new Error('Assignment was never claimed');
    }

    // Get current time in Colombia
    const completedAtColombia = getColombiaTimeSQL();

    // Parse both times as Colombia time (same timezone, no conversion needed)
    let takenAt;
    if (assignment.taken_at instanceof Date) {
      takenAt = assignment.taken_at;
    } else {
      takenAt = new Date(assignment.taken_at.replace(' ', 'T'));
    }

    const completedAt = new Date(completedAtColombia.replace(' ', 'T'));

    // Calculate duration in minutes
    const durationMinutes = Math.round((completedAt.getTime() - takenAt.getTime()) / 60000);

    // Save in Colombia time
    await db.execute(
      'UPDATE chat_assignments SET state = ?, completed_at = ?, duration_minutes = ? WHERE chat_reservation_id = ?',
      ['completed', completedAtColombia, durationMinutes, chatReservationId]
    );

    // Record in history (save Colombia time)
    await recordAssignmentHistory(
      chatReservationId,
      assignment.intranet_username,
      'released',
      durationMinutes,
      assignment.taken_at,
      completedAtColombia
    );

    const updated = await db.getOne(
      'SELECT * FROM chat_assignments WHERE chat_reservation_id = ?',
      [chatReservationId]
    );

    logger.info(`Assignment released for reservation ${chatReservationId} (duration: ${durationMinutes} min)`);
    return updated;
  } catch (error) {
    logger.error('Error releasing assignment', error);
    throw error;
  }
}

// Get active assignments (currently being served)
async function getActiveAssignments() {
  try {
    return await db.query(
      'SELECT * FROM chat_assignments WHERE state = "taken" ORDER BY taken_at DESC',
      []
    );
  } catch (error) {
    logger.error('Error getting active assignments', error);
    throw error;
  }
}

// Get active (taken) assignments with client details joined in
async function getActiveAssignmentsWithDetails() {
  try {
    return await db.query(
      `SELECT a.id, a.intranet_username, a.taken_at,
              r.id AS reservation_id, r.client_name, r.client_phone, r.destination
       FROM chat_assignments a
       JOIN chat_reservations r ON r.id = a.chat_reservation_id
       WHERE a.state = 'taken'
       ORDER BY a.taken_at ASC`,
      []
    );
  } catch (error) {
    logger.error('Error getting active assignments with details', error);
    throw error;
  }
}

// Get advisor stats
async function getAdvisorStats(advisorName, dateFrom = null, dateTo = null) {
  try {
    let sql = 'SELECT * FROM chat_assignments WHERE intranet_username = ? AND state = "completed"';
    const params = [advisorName];

    if (dateFrom && dateTo) {
      sql += ' AND DATE(completed_at) BETWEEN ? AND ?';
      params.push(dateFrom, dateTo);
    }

    sql += ' ORDER BY completed_at DESC';
    const assignments = await db.query(sql, params);

    const totalClients = assignments.length;
    const totalTime = assignments.reduce((sum, a) => sum + (a.duration_minutes || 0), 0);
    const avgTime = totalClients > 0 ? Math.round(totalTime / totalClients) : 0;

    return {
      advisor: advisorName,
      totalClients,
      totalMinutes: totalTime,
      avgMinutesPerClient: avgTime,
      assignments
    };
  } catch (error) {
    logger.error('Error getting advisor stats', error);
    throw error;
  }
}

// Check if chat is available (free) by reservation ID
async function isChatAvailable(chatReservationId) {
  try {
    const assignment = await getAssignment(chatReservationId);
    if (!assignment) return true;
    return assignment.state === 'free';
  } catch (error) {
    logger.error('Error checking chat availability', error);
    throw error;
  }
}

// Check if chat is available by lead ID (WhatsApp user ID)
// Checks ALL reservations for this lead (not just the most recent) since a
// new reservation can be created after a previous one was already claimed
async function isChatAvailableByLeadId(leadId) {
  try {
    const db = require('../db/database.js');

    // Look for ANY assignment tied to this lead's reservations that is currently 'taken'
    const activeAssignment = await db.getOne(
      `SELECT a.id
       FROM chat_assignments a
       JOIN chat_reservations r ON r.id = a.chat_reservation_id
       WHERE r.lead_id = ? AND a.state = 'taken'
       LIMIT 1`,
      [leadId]
    );

    // Not available only if actively being served (state = 'taken') by an advisor
    return !activeAssignment;
  } catch (error) {
    logger.error('Error checking chat availability by lead ID', error);
    return true; // Assume available if there's an error
  }
}

// Get advisor name for a lead (if assigned)
async function getAdvisorNameByLeadId(leadId) {
  try {
    const db = require('../db/database.js');

    // Find most recent reservation for this lead
    const reservation = await db.getOne(
      'SELECT id FROM chat_reservations WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    if (!reservation) {
      return null;
    }

    // Check if this reservation has an active assignment
    const assignment = await getAssignment(reservation.id);
    if (!assignment || assignment.state !== 'taken') {
      return null; // No active advisor
    }

    // Return the advisor name
    return assignment.intranet_username || assignment.advisor_name || null;
  } catch (error) {
    logger.error('Error getting advisor name by lead ID', error);
    return null;
  }
}

// Bulk release all active assignments
async function releaseAllAssignments() {
  try {
    // Query all active assignments
    const activeAssignments = await db.query(
      'SELECT * FROM chat_assignments WHERE state = "taken"',
      []
    );

    if (activeAssignments.length === 0) {
      logger.info('No active assignments to release');
      return { released: 0, failed: 0 };
    }

    let released = 0;
    let failed = 0;
    const completedAtColombia = getColombiaTimeSQL();

    for (const assignment of activeAssignments) {
      try {
        // Calculate duration in minutes
        let takenAt;
        if (assignment.taken_at instanceof Date) {
          takenAt = assignment.taken_at;
        } else {
          takenAt = new Date(assignment.taken_at.replace(' ', 'T'));
        }

        const completedAt = new Date(completedAtColombia.replace(' ', 'T'));
        const durationMinutes = Math.round((completedAt.getTime() - takenAt.getTime()) / 60000);

        // Update assignment
        await db.execute(
          'UPDATE chat_assignments SET state = ?, completed_at = ?, duration_minutes = ? WHERE id = ?',
          ['completed', completedAtColombia, durationMinutes, assignment.id]
        );

        // Record in history
        await recordAssignmentHistory(
          assignment.id,
          assignment.intranet_username,
          'released_bulk',
          durationMinutes,
          assignment.taken_at,
          completedAtColombia
        );

        released++;
      } catch (error) {
        logger.error(`Error releasing assignment ${assignment.id}`, error);
        failed++;
      }
    }

    logger.info(`🎉 Bulk release complete: ${released} released, ${failed} failed`);
    return { released, failed };
  } catch (error) {
    logger.error('Error in releaseAllAssignments', error);
    throw error;
  }
}

module.exports = {
  getOrCreateAssignment,
  getAssignment,
  claimAssignment,
  releaseAssignment,
  releaseAllAssignments,
  getActiveAssignments,
  getActiveAssignmentsWithDetails,
  getAdvisorStats,
  isChatAvailable,
  isChatAvailableByLeadId,
  getAdvisorNameByLeadId,
  getDateOnly,
  recordAssignmentHistory,
  formatAssignmentForResponse
};
