# Audio Transcription Support for WhatsApp Bot

**Date:** 2026-07-20  
**Status:** Design  
**Scope:** Add support for receiving audio messages from WhatsApp and responding with text replies

## Executive Summary

The bot currently processes only text messages from WhatsApp. This feature adds audio transcription support by:
1. Detecting and downloading audio files from incoming WhatsApp messages
2. Validating audio duration (max 1 minute)
3. Converting audio to base64 and sending to Claude API
4. Claude automatically transcribes the audio and processes it
5. Responding with text message to the user

## User Workflow

1. User sends an audio message via WhatsApp
2. Bot downloads and validates the audio (≤ 1 minute)
3. Bot sends audio to Claude with context that it's audio content
4. Claude transcribes the audio and generates a response
5. Bot sends text response back to WhatsApp

## Technical Architecture

### System Flow

```
WhatsApp Audio Message
    ↓
whatsappClient.js detects message.hasMedia
    ↓
Download media via downloadMedia()
    ↓
Get audio metadata (duration check)
    ↓
Validate duration ≤ 60 seconds
    ├─ If valid: convert to base64 → pass to claudeHandler
    └─ If invalid: respond "Por favor, envía audios de máximo 1 minuto"
    ↓
claudeHandler.js receives base64 + MIME type
    ↓
Format message for Claude API with audio content
    ↓
Claude processes (auto-transcribes + generates response)
    ↓
Send text response back to WhatsApp
```

### File Changes

#### `whatsappClient.js`
- Add media detection: check `message.hasMedia` property
- Add audio file download logic using `message.downloadMedia()`
- Add duration validation using ffprobe/ffmpeg
- Add base64 encoding for audio data
- Pass audio data to `callClaude()` with a flag indicating content type
- Implement error handling for each step with user-friendly Spanish messages

#### `claudeHandler.js`
- Modify `callClaude(userMessage, userId, audioData = null)` signature
- Add logic to build Claude message with audio content (if audioData provided)
- Use Claude's vision/audio capability: pass audio as base64 with MIME type
- Keep conversation history consistent (audio transcription becomes part of history)
- Maintain system prompt context for audio messages

#### New Dependency
- `ffmpeg-fluent` or `fluent-ffmpeg`: to extract audio metadata (duration validation)
  - Lightweight, commonly available in Node.js stacks
  - Used only to validate duration before processing

### Error Handling

| Scenario | Response | Notes |
|----------|----------|-------|
| Audio > 60 seconds | "Por favor, envía audios de máximo 1 minuto" | Rejected before Claude |
| Download fails | "Disculpa, no pude descargar el audio. Intenta de nuevo." | Network/parsing issue |
| Duration can't be determined | "Disculpa, no pude procesar el audio. Intenta de nuevo." | Metadata extraction fails |
| Claude can't transcribe audio | "Disculpa, no entiendo el audio. Por favor, envía un mensaje de texto." | Audio too unclear |
| Other Claude API error | Existing fallback: "Disculpa, tuve un problema..." | Matches current behavior |

### Conversation History Integration

- Audio transcriptions are not stored separately; Claude's transcribed text becomes part of the conversation history
- User sees the bot's response in the history, just like with text messages
- System prompt applies to all messages (text and audio)
- No special handling needed for multi-turn conversations

### Constraints & Limitations

1. **Maximum audio duration:** 1 minute (user requirement for cost/performance)
2. **Audio formats supported:** `.ogg`, `.m4a` (WhatsApp standard formats)
3. **Language:** Spanish prompts/responses (RYC bot specific)
4. **No audio responses:** Bot responds with text only (phase 1)
5. **Storage:** Audio files downloaded temporarily, deleted after processing
6. **Costs:** Only standard Claude API tokens (audio counts as tokens, minimal cost)

### Data Privacy & Security

- Audio files are downloaded to temporary filesystem
- Deleted immediately after base64 encoding and Claude processing
- No persistence of audio files
- Conversation history contains only transcribed text (not audio metadata)
- Standard WhatsApp message encryption applies

### Testing Strategy

1. **Unit tests for audio handling:**
   - Duration validation (< 1 min, = 1 min, > 1 min)
   - Base64 encoding correctness
   - MIME type detection

2. **Integration tests:**
   - End-to-end with mock WhatsApp messages containing audio
   - Verify Claude receives correctly formatted audio
   - Verify text responses are sent back

3. **Manual testing:**
   - Send real audio messages via WhatsApp
   - Test edge cases: 59s, 60s, 61s audios
   - Test unclear audio (expected: "Por favor envía un mensaje")
   - Verify multi-turn conversations work with mixed text/audio

## Dependencies to Add

```json
{
  "ffmpeg-fluent": "^2.1.2"  // For audio metadata extraction
}
```

Alternative: `fluent-ffmpeg` (slightly larger, more features) - decision point during implementation

## Success Criteria

- ✅ Bot accepts audio messages from WhatsApp
- ✅ Audio ≤ 60 seconds is processed successfully
- ✅ Audio > 60 seconds is rejected with appropriate message
- ✅ Unclear/unrecognizable audio triggers appropriate error message
- ✅ Bot responds with text message (same as text-only conversations)
- ✅ Conversation history is maintained correctly
- ✅ No audio files persist after processing
- ✅ System prompt applies consistently to audio content

## Out of Scope (Future Phases)

- Audio responses (TTS): will be phase 2
- Video message support: separate phase
- File attachments (images, documents): separate consideration
- Real-time audio streaming: not applicable to WhatsApp API

## Rollback Plan

If issues occur:
1. Disable audio detection in `whatsappClient.js` (single flag)
2. Bot reverts to text-only mode
3. Existing text conversations unaffected
4. No database migrations needed (stateless design)
