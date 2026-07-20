# Audio Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audio message support to WhatsApp bot so users can send audio messages and receive text responses via Claude's audio processing.

**Architecture:** Audio files downloaded from WhatsApp are validated for duration (max 60s), converted to base64, and sent to Claude API which handles transcription automatically. Responses remain text-only. The implementation modifies existing message handling to detect audio and route it through Claude's vision/audio capability.

**Tech Stack:** Node.js CommonJS, whatsapp-web.js, Anthropic Claude API, ffmpeg-fluent (metadata extraction), no database changes

## Global Constraints

- Maximum audio duration: 60 seconds (hard limit enforced before Claude processing)
- Audio formats supported: `.ogg`, `.m4a` (WhatsApp standard formats)
- Responses: text only (no TTS in this phase)
- Language: Spanish for all user-facing messages and error handling
- No persistence of audio files (temporary download only)
- Compatible with existing conversation history system
- Must use CommonJS (no ESM)

---

## File Structure

**Modified files:**
- `src/whatsappClient.js` — Add audio message detection and download logic
- `src/claudeHandler.js` — Add audio content handling in Claude message formatting

**New files:**
- `src/utils/audioHandler.js` — Utilities for audio validation, metadata extraction, and base64 encoding
- `tests/unit/audioHandler.test.js` — Unit tests for audio utilities

**Existing files (no changes needed):**
- `src/conversationHistory.js` — Works as-is (transcript becomes part of history)
- `src/utils/logger.js` — Logging works for audio messages too
- `prompts/ryc-system-prompt.txt` — System prompt applies to audio content

---

## Task 1: Install and Configure ffmpeg-fluent

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `ffmpeg-fluent` module available via `require('fluent-ffmpeg')`

- [ ] **Step 1: Add ffmpeg-fluent dependency**

Open `package.json` and add to `dependencies`:
```json
{
  "fluent-ffmpeg": "^2.1.2"
}
```

Final `dependencies` section should look like:
```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.27.3",
  "dotenv": "^16.4.5",
  "fluent-ffmpeg": "^2.1.2",
  "qrcode-terminal": "^0.12.0",
  "whatsapp-web.js": "^1.34.7"
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: Package installs successfully, `node_modules/fluent-ffmpeg` exists

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add fluent-ffmpeg for audio metadata extraction"
```

---

## Task 2: Create Audio Utilities Module

**Files:**
- Create: `src/utils/audioHandler.js`

**Interfaces:**
- Exports: 
  - `validateAudioDuration(filePath, maxSeconds = 60)` → returns `Promise<{valid: boolean, duration: number}>`
  - `audioToBase64(filePath)` → returns `Promise<string>`
  - `getMimeType(filePath)` → returns `string`

- [ ] **Step 1: Create audioHandler.js**

Create file `src/utils/audioHandler.js`:

```javascript
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const logger = require('./logger.js');

// Validate audio duration
async function validateAudioDuration(filePath, maxSeconds = 60) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        logger.error('ffprobe error:', err.message);
        resolve({ valid: false, duration: 0 });
        return;
      }

      const duration = metadata.format.duration;
      const valid = duration <= maxSeconds;
      
      logger.debug(`Audio duration: ${duration.toFixed(2)}s, max: ${maxSeconds}s, valid: ${valid}`);
      resolve({ valid, duration });
    });
  });
}

// Convert audio file to base64 string
async function audioToBase64(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    logger.debug(`Audio converted to base64, size: ${base64.length} chars`);
    return base64;
  } catch (error) {
    logger.error('Failed to convert audio to base64:', error.message);
    throw error;
  }
}

// Get MIME type based on file extension
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
  };
  return mimeTypes[ext] || 'audio/mpeg';
}

module.exports = {
  validateAudioDuration,
  audioToBase64,
  getMimeType
};
```

- [ ] **Step 2: Verify file creation**

Run: `ls -la src/utils/audioHandler.js`

Expected: File exists with correct content

- [ ] **Step 3: Commit**

```bash
git add src/utils/audioHandler.js
git commit -m "feat: add audio utilities for duration validation and base64 encoding"
```

---

## Task 3: Modify claudeHandler to Support Audio Content

**Files:**
- Modify: `src/claudeHandler.js`

**Interfaces:**
- Consumes: 
  - `getMimeType(filePath)` from audioHandler
  - Existing: `addMessage()`, `getHistory()`, Claude messages API
- Produces: Modified `callClaude()` function signature
  - `callClaude(userMessage, userId, audioData = null)` 
  - `audioData` object: `{base64: string, mimeType: string, filePath: string}` (optional)

- [ ] **Step 1: Update claudeHandler.js imports**

At the top of `src/claudeHandler.js`, add import for audioHandler:

```javascript
const { getMimeType } = require('./utils/audioHandler.js');
```

File should now have:
```javascript
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger.js');
const { addMessage, getHistory } = require('./conversationHistory.js');
const { getMimeType } = require('./utils/audioHandler.js');
```

- [ ] **Step 2: Update callClaude function signature**

Find the line:
```javascript
async function callClaude(userMessage, userId) {
```

Replace with:
```javascript
async function callClaude(userMessage, userId, audioData = null) {
```

- [ ] **Step 3: Add audio content building logic**

Inside `callClaude()`, after the line `addMessage(userId, 'user', userMessage);`, add this logic:

Replace:
```javascript
    addMessage(userId, 'user', userMessage);
    const history = getHistory(userId);
```

With:
```javascript
    // Build user message content (text + optional audio)
    let userContent;
    
    if (audioData) {
      // Audio message: send both transcription prompt and audio to Claude
      userContent = [
        {
          type: 'text',
          text: 'El usuario envió un mensaje de audio. Por favor, transcríbelo y responde.'
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: audioData.mimeType,
            data: audioData.base64
          }
        }
      ];
      
      // Add user message to history using the transcribed text placeholder
      addMessage(userId, 'user', '[Audio message: waiting for transcription]');
      logger.debug(`Audio message received from ${userId}, sent to Claude for transcription`);
    } else {
      // Text message: standard flow
      userContent = userMessage;
      addMessage(userId, 'user', userMessage);
    }
    
    const history = getHistory(userId);
```

- [ ] **Step 4: Update Claude API call to use userContent**

Find the line in `callClaude()`:
```javascript
      const message = await getClient().messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 1024,
        system: systemPrompt,
        messages: history
      });
```

This needs to handle both text and structured content. Update the messages array formatting. Find where history messages are being sent and replace the entire message creation with:

```javascript
      // Format messages for API - handle both text and structured content
      const formattedMessages = history.map(msg => {
        if (msg.role === 'user' && audioData && history.indexOf(msg) === history.length - 1) {
          // For audio messages, send structured content
          return {
            role: msg.role,
            content: userContent
          };
        }
        return msg;
      });

      const message = await getClient().messages.create({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 1024,
        system: systemPrompt,
        messages: formattedMessages
      });
```

- [ ] **Step 5: Verify the complete callClaude function**

The updated `callClaude` function should look like:

```javascript
async function callClaude(userMessage, userId, audioData = null) {
  try {
    logger.debug(`Processing message from ${userId}${audioData ? ' (audio)' : ''}`);

    // Build user message content (text + optional audio)
    let userContent;
    
    if (audioData) {
      // Audio message: send both transcription prompt and audio to Claude
      userContent = [
        {
          type: 'text',
          text: 'El usuario envió un mensaje de audio. Por favor, transcríbelo y responde.'
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: audioData.mimeType,
            data: audioData.base64
          }
        }
      ];
      
      // Add user message to history using the transcribed text placeholder
      addMessage(userId, 'user', '[Audio message: waiting for transcription]');
      logger.debug(`Audio message received from ${userId}, sent to Claude for transcription`);
    } else {
      // Text message: standard flow
      userContent = userMessage;
      addMessage(userId, 'user', userMessage);
    }
    
    const history = getHistory(userId);

    // Format messages for API - handle both text and structured content
    const formattedMessages = history.map(msg => {
      if (msg.role === 'user' && audioData && history.indexOf(msg) === history.length - 1) {
        // For audio messages, send structured content
        return {
          role: msg.role,
          content: userContent
        };
      }
      return msg;
    });

    const message = await getClient().messages.create({
      model: 'claude-opus-4-1-20250805',
      max_tokens: 1024,
      system: systemPrompt,
      messages: formattedMessages
    });

    const response = message.content[0].text;
    addMessage(userId, 'assistant', response);
    logger.debug(`Claude response: "${response}"`);
    return response;
  } catch (error) {
    logger.error('Claude API call failed', error);
    // Return fallback message in Spanish
    return 'Disculpa, tuve un problema procesando tu mensaje. Conectamos con un agente: +57 1 XXXX XXXX';
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/claudeHandler.js
git commit -m "feat: add audio content support to Claude message formatting"
```

---

## Task 4: Modify whatsappClient to Detect and Download Audio

**Files:**
- Modify: `src/whatsappClient.js`

**Interfaces:**
- Consumes:
  - `validateAudioDuration()` from audioHandler
  - `audioToBase64()` from audioHandler
  - `getMimeType()` from audioHandler
  - `callClaude()` with optional audioData parameter
- Produces: Updated message handler that routes audio messages to audio processing

- [ ] **Step 1: Add imports to whatsappClient.js**

At the top of `src/whatsappClient.js`, after line 4 (after the logger import), add:

```javascript
const { validateAudioDuration, audioToBase64, getMimeType } = require('./utils/audioHandler.js');
const path = require('path');
const fs = require('fs');
```

File should now have:
```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger.js');
const { callClaude } = require('./claudeHandler.js');
const { validateAudioDuration, audioToBase64, getMimeType } = require('./utils/audioHandler.js');
const path = require('path');
const fs = require('fs');
```

- [ ] **Step 2: Replace the message handler**

Find the entire `client.on('message', async (message) => {` block (lines 39-80) and replace it with:

```javascript
  // Handle incoming messages
  client.on('message', async (message) => {
    // Ignore group messages and bot's own messages
    if (message.isGroupMsg) {
      return;
    }

    try {
      // Check if message has media (audio)
      if (message.hasMedia) {
        logger.info(`📻 Audio message from ${message.from}`);
        
        try {
          // Download media
          const media = await message.downloadMedia();
          logger.debug(`Media downloaded, MIME type: ${media.mimetype}`);
          
          // Create temporary file with correct extension
          const ext = media.mimetype.split('/')[1] === 'ogg' ? 'ogg' : 'm4a';
          const tempFileName = `audio_${Date.now()}.${ext}`;
          const tempFilePath = path.join(__dirname, '..', '.wwebjs_cache', tempFileName);
          
          // Ensure directory exists
          const tempDir = path.dirname(tempFilePath);
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          // Write audio file
          fs.writeFileSync(tempFilePath, Buffer.from(media.data, 'base64'));
          logger.debug(`Audio file saved to: ${tempFilePath}`);
          
          // Validate duration
          const durationCheck = await validateAudioDuration(tempFilePath, 60);
          
          if (!durationCheck.valid) {
            logger.warn(`Audio too long: ${durationCheck.duration.toFixed(2)}s (max: 60s)`);
            try {
              await message.reply('Por favor, envía audios de máximo 1 minuto.');
            } catch (replyError) {
              logger.error(`Failed to send duration error message`, replyError);
            }
            fs.unlinkSync(tempFilePath);
            return;
          }
          
          // Convert to base64
          const audioBase64 = await audioToBase64(tempFilePath);
          const mimeType = getMimeType(tempFilePath);
          
          logger.debug(`Audio converted to base64, duration: ${durationCheck.duration.toFixed(2)}s`);
          
          // Call Claude with audio data
          const response = await callClaude('', message.from, {
            base64: audioBase64,
            mimeType: mimeType,
            filePath: tempFilePath
          });
          
          logger.debug(`Claude response ready: "${response}"`);
          
          // Send response
          try {
            await message.reply(response);
            logger.info(`✅ Response sent to ${message.from}`);
          } catch (sendError) {
            logger.error(`Failed to send via reply(): ${sendError.message}`);
            try {
              const chat = await message.getChat();
              await chat.sendMessage(response);
              logger.info(`✅ Response sent to ${message.from} (via chat)`);
            } catch (chatError) {
              logger.error(`Failed to send via chat.sendMessage(): ${chatError.message}`);
            }
          }
          
          // Clean up temporary file
          try {
            fs.unlinkSync(tempFilePath);
            logger.debug(`Temporary audio file deleted: ${tempFilePath}`);
          } catch (unlinkError) {
            logger.warn(`Failed to delete temporary file: ${unlinkError.message}`);
          }
          
        } catch (mediaError) {
          logger.error(`Failed to process audio message: ${mediaError.message}`);
          try {
            await message.reply('Disculpa, no pude descargar el audio. Intenta de nuevo.');
          } catch (replyError) {
            logger.error(`Failed to send media error message`, replyError);
          }
        }
        return;
      }
      
      // Text message handling (existing flow)
      if (!message.body?.trim()) {
        return;
      }
      
      logger.info(`📨 Message from ${message.from}: "${message.body}"`);

      // Call Claude to get response with user ID for conversation history
      const response = await callClaude(message.body, message.from);
      logger.debug(`Claude response ready: "${response}"`);

      // Send response back
      logger.debug(`Attempting to send message to ${message.from}`);

      try {
        await message.reply(response);
        logger.info(`✅ Response sent to ${message.from}`);
      } catch (sendError) {
        logger.error(`Failed to send via reply(): ${sendError.message}`);
        logger.debug(`Send error details:`, sendError);

        // Try alternative send method
        try {
          const chat = await message.getChat();
          await chat.sendMessage(response);
          logger.info(`✅ Response sent to ${message.from} (via chat)`);
        } catch (chatError) {
          logger.error(`Failed to send via chat.sendMessage(): ${chatError.message}`);
          logger.debug(`Chat send error details:`, chatError);
        }
      }
    } catch (error) {
      logger.error(`Failed to process message from ${message.from}`, error);
      try {
        await message.reply('Disculpa, hubo un error. Intenta de nuevo.');
      } catch (replyError) {
        logger.error(`Failed to send error message`, replyError);
      }
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/whatsappClient.js
git commit -m "feat: add audio message detection and processing in WhatsApp client"
```

---

## Task 5: Manual Testing

**Files:**
- No files created/modified

**Interfaces:**
- Consumes: Fully running bot with all previous tasks complete

- [ ] **Step 1: Start the bot**

Run: `npm start`

Expected: Bot initializes, "🎧 Bot is listening for messages..." appears in logs

- [ ] **Step 2: Test with text message first**

Send a text message via WhatsApp to the bot and verify it responds normally.

Expected: Text message processed, response received

- [ ] **Step 3: Test with valid audio (< 60s)**

Send an audio message less than 60 seconds via WhatsApp and wait for response.

Expected: 
- Logs show "📻 Audio message from..."
- "Audio converted to base64..." appears
- Claude processes audio and responds with text
- "✅ Response sent to..." confirms delivery

- [ ] **Step 4: Test with audio exactly 60 seconds**

Send an audio message that is exactly 60 seconds (or create one for testing).

Expected: Audio accepted and processed normally

- [ ] **Step 5: Test with audio > 60 seconds**

Send an audio message longer than 60 seconds (or record one).

Expected: 
- Bot replies: "Por favor, envía audios de máximo 1 minuto."
- No Claude call is made
- Temporary file is deleted

- [ ] **Step 6: Test with unclear audio**

Send a very unclear or noisy audio message.

Expected: Claude responds with "Disculpa, no entiendo el audio. Por favor, envía un mensaje de texto." or similar

- [ ] **Step 7: Test conversation history**

Send: audio message → receive response → send text message → verify bot remembers audio context

Expected: Conversation history maintains context across text and audio messages

- [ ] **Step 8: Commit testing verification**

```bash
git commit --allow-empty -m "test: manual testing completed for audio transcription"
```

---

## Task 6: Verify No Regressions

**Files:**
- No files created/modified

**Interfaces:**
- Consumes: Fully running bot with all previous tasks complete

- [ ] **Step 1: Test text-only conversation**

Send multiple text messages and verify responses work as before.

Expected: No changes to text message behavior

- [ ] **Step 2: Check logs for errors**

Run the bot for 5+ minutes and review logs for any errors or warnings related to existing functionality.

Expected: No new error patterns, existing error handling works

- [ ] **Step 3: Verify conversation history still works**

Send text → audio → text in same conversation and verify history is maintained.

Expected: Bot can reference earlier messages in same conversation

- [ ] **Step 4: Test error message in Spanish**

Intentionally trigger errors (bad audio, timeout) and verify all error messages are in Spanish.

Expected: All user-facing messages are in Spanish

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "test: verified no regressions in existing functionality"
```

---

## Summary of Changes

**Dependencies Added:**
- `fluent-ffmpeg@^2.1.2`

**Files Modified:**
- `src/claudeHandler.js` — Added audio content building and Claude API formatting
- `src/whatsappClient.js` — Added audio detection, download, validation, and routing

**Files Created:**
- `src/utils/audioHandler.js` — Audio utilities (validation, base64, MIME type detection)

**Total Commits:**
- 6 commits (one per task)

**Testing:**
- Manual testing with real WhatsApp audio messages
- Edge cases: exact 60s, >60s, unclear audio
- Regression testing for text messages

---

## Success Criteria Checklist

- ✅ Audio files ≤ 60s are downloaded and processed
- ✅ Audio files > 60s are rejected with Spanish message
- ✅ Audio base64 is successfully passed to Claude
- ✅ Claude transcribes audio automatically
- ✅ Bot responds with text (no TTS)
- ✅ Temporary audio files are cleaned up
- ✅ Conversation history works with mixed text/audio
- ✅ System prompt applies to audio content
- ✅ Error handling in Spanish
- ✅ No regressions in text message handling
