# AYA RYC Node.js Bot - Design Document

**Date:** 2026-07-18  
**Project:** AYA (Asistente y Ayuda) - WhatsApp Responder for RYC Euroamerican Travel  
**Status:** Approved

---

## Overview

A real-time Node.js bot that listens to WhatsApp Web messages and responds automatically using Claude AI. No persistence layer, no n8n — just direct message handling with Claude context.

**Core purpose:** Respond to customer inquiries on WhatsApp automatically with intelligent, context-aware responses personalized for RYC Euroamerican Travel.

---

## Architecture

```
User sends message on WhatsApp Web
           ↓
    whatsapp-web.js listener
           ↓
    Extract message (from, body, author)
           ↓
    Send to Claude API with system prompt
           ↓
    Claude generates response
           ↓
    Send response back to WhatsApp
           ↓
    Log and repeat
```

---

## Components

### 1. **WhatsApp Client** (whatsapp-web.js)
- **Responsibility:** Connect to WhatsApp Web, listen for incoming messages, send responses
- **Key features:**
  - Scan QR once on first run
  - Persistent session (survives restarts)
  - Real-time message listener
  - Send text responses

### 2. **Claude Handler** (Anthropic SDK)
- **Responsibility:** Process messages through Claude API
- **Input:** Message text + system prompt (from `prompts/ryc-system-prompt.txt`)
- **Output:** Response text from Claude

### 3. **Main Script** (`index.js`)
- **Responsibility:** Orchestrate the two components
- **Handles:**
  - Initialize WhatsApp client
  - Set up message listener
  - Call Claude on each message
  - Send response back
  - Error handling and logging

---

## Data Flow

1. **User → WhatsApp Web:** Customer sends message
2. **whatsapp-web.js → Listener:** Detects incoming message event
3. **Extract:** `{ from: number, body: text, author: sender }`
4. **Claude Request:** Send to Anthropic API with system prompt
5. **Claude Response:** Get AI-generated response
6. **Send Back:** Post response to WhatsApp
7. **Log:** Record interaction (stdout or file)

---

## Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Node.js 18+ | Fast, event-driven, whatsapp-web.js requires it |
| WhatsApp | whatsapp-web.js | Real-time, no Meta API required, QR-based auth |
| AI | Anthropic Claude API | Already have API key, excellent for customer service |
| Config | `.env` file | Secure API key management |
| System Prompt | `prompts/ryc-system-prompt.txt` | Reuse existing prompt |

---

## Error Handling

**Connection failures:** If WhatsApp disconnects, attempt auto-reconnect  
**Claude API failures:** Retry logic (max 2 attempts) before sending generic fallback  
**Message parsing errors:** Log and skip, continue listening  
**Missing credentials:** Exit with clear error message

**Fallback response (if Claude fails):**  
```
"Disculpa, tuve un problema procesando tu mensaje. 
Conectamos con un agente: +57 1 XXXX XXXX"
```

---

## Success Criteria

- ✅ Script starts and connects to WhatsApp (QR scan works)
- ✅ Listens for incoming messages in real-time
- ✅ Sends each message to Claude
- ✅ Responds automatically to user within 2-3 seconds
- ✅ Uses RYC system prompt (professional tone, Colombian Spanish)
- ✅ Handles errors gracefully (doesn't crash)
- ✅ Logs interactions for debugging

---

## File Structure

```
aya_ryc_node/
├── index.js              # Main entry point
├── handlers/
│   ├── claude.js         # Claude API calls
│   └── whatsapp.js       # WhatsApp client setup
├── prompts/
│   └── ryc-system-prompt.txt  # System prompt (reuse from parent)
├── .env.example          # Environment variables template
├── .env                  # Actual env (git-ignored)
├── package.json          # Dependencies
└── docs/
    └── DESIGN.md         # This file
```

---

## Dependencies

- `whatsapp-web.js` — WhatsApp Web automation
- `@anthropic-ai/sdk` — Claude API
- `dotenv` — Environment variable management
- `qrcode-terminal` — Display QR in terminal (optional, for UX)

---

## Execution Flow

```
1. node index.js
2. Load .env (ANTHROPIC_API_KEY, etc.)
3. Initialize WhatsApp client
4. If first run: Display QR → scan with phone
5. On message received:
   - Extract text
   - Call Claude with system prompt
   - Send response to WhatsApp
6. Repeat until process stops
```

---

## Constraints & Assumptions

- WhatsApp Web must stay open in a browser on the same machine (or accessible via Puppeteer)
- Claude API key is valid and has available credits
- System prompt file exists and is readable
- Network connection is stable

---

## Next Steps

1. Initialize Node.js project (npm init)
2. Install dependencies
3. Create handlers (claude.js, whatsapp.js)
4. Write main script (index.js)
5. Test: Manual message exchange
6. Deploy (Docker optional)
