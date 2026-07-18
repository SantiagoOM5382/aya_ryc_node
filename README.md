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
