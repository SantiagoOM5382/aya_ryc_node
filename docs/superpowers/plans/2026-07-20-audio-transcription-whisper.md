# Audio Transcription Implementation Plan (Whisper Edition)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audio message support to WhatsApp bot using local Whisper for transcription. Users send audio → bot transcribes locally → Claude responds with text.

**Architecture:** Audio files downloaded from WhatsApp are validated for duration (max 60s), transcribed locally using OpenAI's Whisper model, and the resulting text is sent to Claude as a normal message. Responses remain text-only. No audio is sent to Claude API.

**Tech Stack:** Node.js CommonJS, whatsapp-web.js, Anthropic Claude API, openai-whisper (Python CLI), ffmpeg-fluent (metadata)

## Global Constraints

- Maximum audio duration: 60 seconds (hard limit enforced before transcription)
- Audio formats supported: `.ogg`, `.m4a` (WhatsApp standard formats)
- Responses: text only (no TTS in this phase)
- Language: Spanish for all user-facing messages and error handling
- No persistence of audio files (temporary download only)
- Compatible with existing conversation history system
- Must use CommonJS (no ESM)
- Whisper runs locally (no API calls to OpenAI)

---

## File Structure

**Modified files:**
- `src/whatsappClient.js` — Add audio message detection and download logic
- `src/claudeHandler.js` — No changes (text message flow only)
- `package.json` — Add openai-whisper Python dependency note

**New files:**
- `src/utils/transcriptionHandler.js` — Utility for audio transcription using Whisper

**Existing files (no changes):**
- `src/conversationHistory.js` — Works as-is
- `src/utils/logger.js` — Logging works for audio messages
- `prompts/ryc-system-prompt.txt` — System prompt applies

---

## Task 1: Install Whisper (Python Package)

**Files:**
- Modify: `package.json` (optional - just for documentation)

**Interfaces:**
- Produces: `whisper` CLI command available globally

- [ ] **Step 1: Install Whisper via pip**

Run: `pip3 install openai-whisper`

Expected: Whisper installs successfully, command `whisper --version` works

- [ ] **Step 2: Download base model (optional, done on first use)**

The first time whisper runs, it auto-downloads the model. This happens during Task 5 testing. For now, just verify installation.

Run: `whisper --version`

Expected: Output shows whisper version (e.g., `openai-whisper x.x.x`)

- [ ] **Step 3: Commit note (optional)**

```bash
git add -A
git commit --allow-empty -m "chore: whisper installed for local audio transcription"
```

---

## Task 2: Create Transcription Handler

**Files:**
- Create: `src/utils/transcriptionHandler.js`

**Interfaces:**
- Exports:
  - `transcribeAudio(filePath)` → returns `Promise<string>` (transcribed text or error message in Spanish)
  - `validateAudioDuration(filePath, maxSeconds = 60)` → returns `Promise<{valid: boolean, duration: number}>` (REUSE from audioHandler)

- [ ] **Step 1: Create transcriptionHandler.js**

Create file `src/utils/transcriptionHandler.js`:

```javascript
const { execSync } = require('child_process');
const path = require('path');
const logger = require('./logger.js');
const { validateAudioDuration } = require('./audioHandler.js');

// Transcribe audio file using local Whisper
async function transcribeAudio(filePath) {
  try {
    logger.debug(`Starting transcription for: ${filePath}`);
    
    // Validate duration
    const durationCheck = await validateAudioDuration(filePath, 60);
    if (!durationCheck.valid) {
      logger.warn(`Audio too long: ${durationCheck.duration.toFixed(2)}s (max: 60s)`);
      return null; // Signal duration validation failed
    }
    
    // Run Whisper to transcribe
    logger.debug(`Running whisper transcription...`);
    const command = `whisper "${filePath}" --output_format txt --output_dir /tmp --quiet --language es`;
    
    try {
      execSync(command, { stdio: 'pipe' });
    } catch (execError) {
      logger.error(`Whisper execution failed: ${execError.message}`);
      return null; // Return null on transcription failure
    }
    
    // Read transcribed text from output file
    const fs = require('fs');
    const outputFile = `/tmp/${path.basename(filePath, path.extname(filePath))}.txt`;
    
    if (!fs.existsSync(outputFile)) {
      logger.error(`Whisper output file not found: ${outputFile}`);
      return null;
    }
    
    const transcript = fs.readFileSync(outputFile, 'utf-8').trim();
    logger.debug(`Transcription successful: "${transcript.substring(0, 50)}..."`);
    
    // Clean up output file
    try {
      fs.unlinkSync(outputFile);
      logger.debug(`Cleaned up transcript file: ${outputFile}`);
    } catch (unlinkError) {
      logger.warn(`Failed to clean transcript file: ${unlinkError.message}`);
    }
    
    return transcript;
  } catch (error) {
    logger.error(`Transcription error: ${error.message}`);
    return null;
  }
}

module.exports = {
  transcribeAudio
};
```

- [ ] **Step 2: Verify file creation**

Run: `ls -la src/utils/transcriptionHandler.js`

Expected: File exists with correct content

- [ ] **Step 3: Test Whisper is callable**

Run: `node -e "const { execSync } = require('child_process'); console.log(execSync('whisper --version').toString());"`

Expected: Whisper version output (confirms whisper CLI is available)

- [ ] **Step 4: Commit**

```bash
git add src/utils/transcriptionHandler.js
git commit -m "feat: add transcription handler for local Whisper audio-to-text"
```

---

## Task 3: Modify whatsappClient to Detect, Download, Transcribe Audio

**Files:**
- Modify: `src/whatsappClient.js`

**Interfaces:**
- Consumes:
  - `transcribeAudio(filePath)` from transcriptionHandler
  - `validateAudioDuration(filePath)` from audioHandler (via transcriptionHandler)
  - `callClaude(userMessage, userId)` existing signature (text only, no audioData param)
- Produces: Updated message handler that detects, downloads, transcribes, and routes audio

- [ ] **Step 1: Add imports**

At the top of `src/whatsappClient.js`, after line 4 (after the logger import), add:

```javascript
const { transcribeAudio } = require('./utils/transcriptionHandler.js');
const path = require('path');
const fs = require('fs');
```

The imports section should look like:
```javascript
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger.js');
const { callClaude } = require('./claudeHandler.js');
const { transcribeAudio } = require('./utils/transcriptionHandler.js');
const path = require('path');
const fs = require('fs');
```

- [ ] **Step 2: Replace entire message handler**

Find and replace the entire `client.on('message', async (message) => {` block (lines 39-80).

Replace with this complete handler:

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
          
          // Transcribe audio using Whisper
          const transcript = await transcribeAudio(tempFilePath);
          
          // Check for errors (null means validation failed or transcription error)
          if (!transcript) {
            logger.warn(`Audio transcription failed or audio too long`);
            try {
              await message.reply('Por favor, envía audios de máximo 1 minuto o intenta de nuevo.');
            } catch (replyError) {
              logger.error(`Failed to send error message`, replyError);
            }
            // Clean up temp file
            try {
              fs.unlinkSync(tempFilePath);
            } catch (unlinkError) {
              logger.warn(`Failed to delete temp audio file: ${unlinkError.message}`);
            }
            return;
          }
          
          logger.info(`✅ Audio transcribed: "${transcript.substring(0, 50)}..."`);
          
          // Call Claude with transcribed text (normal text flow)
          const response = await callClaude(transcript, message.from);
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

- [ ] **Step 3: Verify structure**

The flow should be:
1. Ignore group messages
2. IF audio: download → transcribe → send text to Claude → respond → cleanup
3. ELSE: text message (existing flow)
4. Error handling in Spanish

- [ ] **Step 4: Commit**

```bash
git add src/whatsappClient.js
git commit -m "feat: add audio detection, transcription with Whisper, and text response"
```

---

## Task 4: Manual Testing

**Files:** None

**Interfaces:**
- Consumes: Fully running bot with Tasks 1-3 complete

- [ ] **Step 1: Start bot**

Run: `npm start`

Expected: "🎧 Bot is listening for messages..." in logs

- [ ] **Step 2: Test text message (regression)**

Send text via WhatsApp, verify response.

Expected: Works normally

- [ ] **Step 3: Test audio < 60 seconds**

Send audio < 60s via WhatsApp.

Expected:
- "📻 Audio message from..." in logs
- "Audio transcribed: ..." in logs
- Bot responds with text
- Temp file deleted

- [ ] **Step 4: Test audio > 60 seconds**

Send audio > 60s.

Expected: "Por favor, envía audios de máximo 1 minuto..." response

- [ ] **Step 5: Test unclear audio**

Send very noisy audio.

Expected: Whisper attempts transcription, sends unclear text to Claude, responds with best-effort answer

- [ ] **Step 6: Conversation history test**

Send: text 1 → audio → text 2 (referencing earlier)

Expected: History maintained, context preserved

- [ ] **Step 7: Document results**

In report file, note all tests and any issues.

## Task 5: Verify No Regressions

**Files:** None

- [ ] **Step 1-8:** Run same regression tests as before

Expected: No new errors, text messages work, history maintained

---

## Success Criteria

✅ Bot starts without errors
✅ Text messages work (regression)
✅ Audio < 60s is transcribed and responded to
✅ Audio > 60s is rejected with Spanish message
✅ Conversation history works with mixed content
✅ Temporary files cleaned up
✅ All error messages in Spanish
✅ No crashes or unhandled exceptions
