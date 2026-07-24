const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const STATE_FILE = path.join(__dirname, '../../state.json');

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      const defaultState = { claudeEnabled: true };
      saveState(defaultState);
      return defaultState;
    }
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to load state: ${error.message}`);
    return { claudeEnabled: true };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    logger.info(`💾 State saved: claudeEnabled=${state.claudeEnabled}`);
  } catch (error) {
    logger.error(`Failed to save state: ${error.message}`);
  }
}

function toggleClaude() {
  const state = loadState();
  state.claudeEnabled = !state.claudeEnabled;
  saveState(state);
  return state;
}

module.exports = { loadState, saveState, toggleClaude };
