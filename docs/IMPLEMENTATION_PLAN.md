# AYA RYC Node.js Bot - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time Node.js bot that listens to WhatsApp Web messages and responds automatically using Claude AI with the RYC system prompt.

**Architecture:** Three independent modules (WhatsApp client, Claude handler, main orchestrator) communicate synchronously. WhatsApp listener triggers Claude calls; responses flow back to user.

**Tech Stack:** Node.js 18+, whatsapp-web.js, @anthropic-ai/sdk, dotenv, qrcode-terminal

## Global Constraints

- Node.js 18 or higher required
- Anthropic API key must be valid and have available quota
- System prompt file must exist at `prompts/ryc-system-prompt.txt`
- WhatsApp Web must be accessible from the machine running the script
- All API calls to Claude must use the system prompt from the RYC file

---

## Task 1: Project Setup & Dependencies

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.env`
- Create: `.gitignore`

**Produces:** Working Node.js environment with all dependencies installed

- [ ] **Step 1: Initialize package.json**

Create `/home/analista_ti/aya_ryc_node/package.json`:

```json
{
  "name": "aya-ryc-bot",
  "version": "1.0.0",
  "description": "WhatsApp bot for RYC Euroamerican Travel using Claude AI",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node index.js"
  },
  "keywords": ["whatsapp", "claude", "bot", "ryc"],
  "author": "AYA Team",
  "license": "MIT",
  "dependencies": {
    "whatsapp-web.js": "^1.25.0",
    "@anthropic-ai/sdk": "^0.27.3",
    "dotenv": "^16.4.5",
    "qrcode-terminal": "^0.12.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Create .env.example**

Create `/home/analista_ti/aya_ryc_node/.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
NODE_ENV=development
```

- [ ] **Step 3: Create .env with real key**

Copy `.env.example` to `.env` and add your actual `ANTHROPIC_API_KEY`:

```bash
cp /home/analista_ti/aya_ryc_node/.env.example /home/analista_ti/aya_ryc_node/.env
# Then edit .env and paste your ANTHROPIC_API_KEY
```

Verify the key starts with `sk-ant-`

- [ ] **Step 4: Create .gitignore**

Create `/home/analista_ti/aya_ryc_node/.gitignore`:

```
node_modules/
.env
.env.local
.DS_Store
*.log
.wwebjs_auth/
.session-data/
```

- [ ] **Step 5: Install dependencies**

Run in `/home/analista_ti/aya_ryc_node/`:

```bash
npm install
```

Expected output: Shows all packages installed successfully (whatsapp-web.js, @anthropic-ai/sdk, dotenv, qrcode-terminal)

- [ ] **Step 6: Verify installation**

```bash
npm list
```

Expected: All 4 main dependencies listed without errors

- [ ] **Step 7: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: initialize node project with dependencies"
```

---

## Task 2: Logging Utility

**Files:**
- Create: `src/utils/logger.js`

**Produces:** Simple logger function that formats console output

- [ ] **Step 1: Create logger utility**

Create `/home/analista_ti/aya_ryc_node/src/utils/logger.js`:

```javascript
const logger = {
  info: (message) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`);
  },
  error: (message, error = null) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`);
    if (error) console.error(error);
  },
  warn: (message) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`);
  },
  debug: (message) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
    }
  }
};

export default logger;
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la /home/analista_ti/aya_ryc_node/src/utils/logger.js
```

Expected: File exists

- [ ] **Step 3: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add src/utils/logger.js
git commit -m "chore: add logger utility"
```

---

## Task 3: Claude Handler

**Files:**
- Create: `src/claudeHandler.js`

**Produces:** Async function `callClaude(userMessage)` that sends message to Claude and returns response

- [ ] **Step 1: Create claudeHandler module**

Create `/home/analista_ti/aya_ryc_node/src/claudeHandler.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import logger from './utils/logger.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Load system prompt from file
let systemPrompt = '';
try {
  const promptPath = path.join(__dirname, '..', 'prompts', 'ryc-system-prompt.txt');
  systemPrompt = fs.readFileSync(promptPath, 'utf-8');
  logger.info('System prompt loaded successfully');
} catch (error) {
  logger.error('Failed to load system prompt', error);
  process.exit(1);
}

export async function callClaude(userMessage) {
  try {
    logger.debug(`Sending message to Claude: "${userMessage}"`);
    
    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    const response = message.content[0].text;
    logger.debug(`Claude response: "${response}"`);
    return response;
  } catch (error) {
    logger.error('Claude API call failed', error);
    // Return fallback message in Spanish
    return 'Disculpa, tuve un problema procesando tu mensaje. Conectamos con un agente: +57 1 XXXX XXXX';
  }
}
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la /home/analista_ti/aya_ryc_node/src/claudeHandler.js
```

Expected: File exists

- [ ] **Step 3: Test Claude handler manually**

Create a temporary test file `/home/analista_ti/aya_ryc_node/test-claude.js`:

```javascript
import { callClaude } from './src/claudeHandler.js';

const testMessage = '¿Cuáles son los destinos principales?';
const response = await callClaude(testMessage);
console.log('Response:', response);
```

Run it:

```bash
cd /home/analista_ti/aya_ryc_node
node test-claude.js
```

Expected: Claude responds with information about destinations (in Spanish, per system prompt)

- [ ] **Step 4: Clean up test file**

```bash
rm /home/analista_ti/aya_ryc_node/test-claude.js
```

- [ ] **Step 5: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add src/claudeHandler.js
git commit -m "feat: add claude handler with system prompt"
```

---

## Task 4: WhatsApp Client Setup

**Files:**
- Create: `src/whatsappClient.js`

**Produces:** Async functions `initializeClient()` and `getClient()` to manage WhatsApp Web connection

- [ ] **Step 1: Create whatsappClient module**

Create `/home/analista_ti/aya_ryc_node/src/whatsappClient.js`:

```javascript
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode-terminal';
import logger from './utils/logger.js';

let client = null;

export async function initializeClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  // QR code for first authentication
  client.on('qr', (qr) => {
    logger.info('QR code generated - scan with your phone:');
    QRCode.generate(qr, { small: true });
  });

  // Ready event
  client.on('ready', () => {
    logger.info('✅ WhatsApp client is ready!');
  });

  // Authentication failure
  client.on('auth_failure', (msg) => {
    logger.error('Authentication failed:', msg);
  });

  // Disconnected
  client.on('disconnected', (reason) => {
    logger.warn(`WhatsApp disconnected: ${reason}`);
  });

  // Initialize client
  await client.initialize();
  logger.info('WhatsApp client initialized');

  return client;
}

export function getClient() {
  if (!client) {
    throw new Error('WhatsApp client not initialized. Call initializeClient() first.');
  }
  return client;
}

export async function sendMessage(chatId, message) {
  try {
    const chat = await client.getChatById(chatId);
    await chat.sendMessage(message);
    logger.debug(`Message sent to ${chatId}: "${message}"`);
  } catch (error) {
    logger.error(`Failed to send message to ${chatId}`, error);
  }
}
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la /home/analista_ti/aya_ryc_node/src/whatsappClient.js
```

Expected: File exists

- [ ] **Step 3: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add src/whatsappClient.js
git commit -m "feat: add whatsapp client setup and connection"
```

---

## Task 5: Main Script - Message Listener & Orchestrator

**Files:**
- Create: `index.js`

**Consumes:** 
- `initializeClient()` and `getClient()` from whatsappClient.js
- `callClaude(userMessage)` from claudeHandler.js

**Produces:** Running bot that listens to messages and responds

- [ ] **Step 1: Create main index.js**

Create `/home/analista_ti/aya_ryc_node/index.js`:

```javascript
import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import { initializeClient, getClient, sendMessage } from './src/whatsappClient.js';
import { callClaude } from './src/claudeHandler.js';

dotenv.config();

// Validate environment
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('ANTHROPIC_API_KEY not found in .env file');
  process.exit(1);
}

async function startBot() {
  try {
    logger.info('🤖 Starting AYA Bot...');

    // Initialize WhatsApp client
    const client = await initializeClient();

    // Set up message listener
    client.on('message', async (message) => {
      // Ignore group messages and bot's own messages
      if (message.from === message.to || message.isGroupMsg) {
        return;
      }

      try {
        logger.info(`📨 Message from ${message.from}: "${message.body}"`);

        // Call Claude
        const response = await callClaude(message.body);

        // Send response back
        await sendMessage(message.from, response);
        logger.info(`✅ Response sent to ${message.from}`);
      } catch (error) {
        logger.error(`Failed to process message from ${message.from}`, error);
        // Optionally send error message to user
        await sendMessage(message.from, 'Disculpa, hubo un error. Intenta de nuevo.');
      }
    });

    logger.info('🎧 Bot is listening for messages...');
  } catch (error) {
    logger.error('Failed to start bot', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});
```

- [ ] **Step 2: Verify file exists**

```bash
ls -la /home/analista_ti/aya_ryc_node/index.js
```

Expected: File exists

- [ ] **Step 3: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add index.js
git commit -m "feat: add main bot script with message listener"
```

---

## Task 6: Copy System Prompt

**Files:**
- Modify: Copy from parent directory to `prompts/ryc-system-prompt.txt`

**Produces:** System prompt available at the expected path

- [ ] **Step 1: Create prompts directory if needed**

```bash
mkdir -p /home/analista_ti/aya_ryc_node/prompts
```

- [ ] **Step 2: Copy system prompt from parent project**

```bash
cp /home/analista_ti/aya_ryc/prompts/ryc-system-prompt.txt /home/analista_ti/aya_ryc_node/prompts/
```

- [ ] **Step 3: Verify file exists**

```bash
ls -la /home/analista_ti/aya_ryc_node/prompts/ryc-system-prompt.txt
wc -l /home/analista_ti/aya_ryc_node/prompts/ryc-system-prompt.txt
```

Expected: File exists and has content (should be ~60+ lines)

- [ ] **Step 4: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add prompts/ryc-system-prompt.txt
git commit -m "chore: add ryc system prompt"
```

---

## Task 7: Documentation & Usage Guide

**Files:**
- Create: `README.md`

**Produces:** Clear usage instructions for running the bot

- [ ] **Step 1: Create README.md**

Create `/home/analista_ti/aya_ryc_node/README.md`:

```markdown
# AYA RYC WhatsApp Bot

Intelligent WhatsApp bot that responds to customer inquiries using Claude AI, personalized for RYC Euroamerican Travel.

## Quick Start

### Prerequisites
- Node.js 18 or higher
- Anthropic API Key (get it from https://console.anthropic.com/account/keys)
- WhatsApp account with access to WhatsApp Web

### Setup

1. **Clone/download this project**
   ```bash
   cd /home/analista_ti/aya_ryc_node
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and paste your ANTHROPIC_API_KEY
   nano .env
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

5. **Authenticate on first run**
   - A QR code will appear in the terminal
   - Scan it with your phone's WhatsApp camera
   - The bot will connect to WhatsApp Web

6. **Test it**
   - Send any message to your WhatsApp number
   - AYA should respond automatically within 2-3 seconds

## How It Works

1. **Message arrives** → WhatsApp Web detects it
2. **Claude processes** → Sends to Claude API with RYC system prompt
3. **Response generated** → Claude returns contextualized response
4. **Message sent** → Response automatically sent to user
5. **Repeat** → Listens for next message

## Logs

Console output shows:
- `[INFO]` - Normal operations
- `[DEBUG]` - Detailed message content (dev only)
- `[WARN]` - Connection issues
- `[ERROR]` - API failures or errors

Set `NODE_ENV=development` in `.env` to see debug logs.

## Files

- `index.js` - Main entry point
- `src/claudeHandler.js` - Claude API integration
- `src/whatsappClient.js` - WhatsApp Web connection
- `src/utils/logger.js` - Logging utility
- `prompts/ryc-system-prompt.txt` - System prompt for Claude
- `.env` - Environment variables (git-ignored)

## Troubleshooting

**"ANTHROPIC_API_KEY not found"**
- Make sure `.env` file exists
- Check that `ANTHROPIC_API_KEY=sk-ant-...` is filled in

**"System prompt not found"**
- Verify `prompts/ryc-system-prompt.txt` exists
- Check file path is correct

**"WhatsApp won't connect"**
- Make sure WhatsApp Web is not already open in another browser
- Try clearing the `.wwebjs_auth` directory and re-authenticating

**"Claude API errors"**
- Check your API key is valid
- Verify you have available credits in Anthropic console
- Check network connection

## Next Steps

- Customize system prompt in `prompts/ryc-system-prompt.txt`
- Add persistent message history (currently responds independently)
- Deploy to server/Docker
- Add database for customer history

## Support

For issues with:
- **WhatsApp Web** - Check whatsapp-web.js documentation
- **Claude API** - Check Anthropic documentation
- **This bot** - Review logs and error messages

## License

Proprietary - RYC Euroamerican Travel
```

- [ ] **Step 2: Verify README exists**

```bash
ls -la /home/analista_ti/aya_ryc_node/README.md
```

Expected: File exists

- [ ] **Step 3: Commit**

```bash
cd /home/analista_ti/aya_ryc_node
git add README.md
git commit -m "docs: add comprehensive README and usage guide"
```

---

## Task 8: First Run & Validation

**Files:**
- No new files

**Produces:** Validated, working bot that can connect and respond

- [ ] **Step 1: Verify all dependencies installed**

```bash
cd /home/analista_ti/aya_ryc_node
npm list --depth=0
```

Expected output shows:
```
aya-ryc-bot@1.0.0
├── @anthropic-ai/sdk@X.X.X
├── dotenv@X.X.X
├── qrcode-terminal@X.X.X
└── whatsapp-web.js@X.X.X
```

- [ ] **Step 2: Verify .env is configured**

```bash
grep ANTHROPIC_API_KEY /home/analista_ti/aya_ryc_node/.env | grep -v "^#"
```

Expected: Shows `ANTHROPIC_API_KEY=sk-ant-...` (not empty, not the example)

- [ ] **Step 3: Verify system prompt exists**

```bash
head -5 /home/analista_ti/aya_ryc_node/prompts/ryc-system-prompt.txt
```

Expected: Shows first few lines of the prompt (should start with "Eres AYA...")

- [ ] **Step 4: Start the bot**

```bash
cd /home/analista_ti/aya_ryc_node
timeout 30 npm start 2>&1 | head -20
```

Expected output should show:
- `[INFO] ... Starting AYA Bot...`
- `[INFO] ... WhatsApp client initialized`
- QR code displayed (if first run)
- `[INFO] ... Bot is listening for messages...`

**Note:** The bot will run indefinitely. The `timeout` command stops it after 30 seconds for testing.

- [ ] **Step 5: If QR appeared, scan it**

When you run `npm start`:
- A QR code will print in the terminal
- Use your WhatsApp app on your phone
- Tap the camera icon
- Point at the QR code
- Confirm on your phone

Bot will show `[INFO] ✅ WhatsApp client is ready!`

- [ ] **Step 6: Stop the bot**

Press `Ctrl+C` to stop. Expected: Clean shutdown message.

- [ ] **Step 7: Create final commit**

```bash
cd /home/analista_ti/aya_ryc_node
git log --oneline | head -10
```

Expected: Shows all 7-8 commits we've made

---

## Summary

The implementation is now complete with:
- ✅ Project initialized with all dependencies
- ✅ Claude handler ready to call Claude API
- ✅ WhatsApp client set up for message listening
- ✅ Main script orchestrating message flow
- ✅ System prompt loaded from RYC file
- ✅ Logging throughout for debugging
- ✅ Documentation for running and troubleshooting
- ✅ Bot validated and ready for manual testing

**To run:** `npm start` from the project directory, scan the QR code, and send a WhatsApp message to test.
