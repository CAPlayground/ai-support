# CAPlayground Support Bot

A Discord support bot for CAPlayground, powered by Google Gemini AI with documentation knowledge and self-training capabilities. Fully made my Claude 4.5 Sonnet.

## Setup

### Prerequisites

- Node.js 18 or higher
- Discord Bot Token ([Create one here](https://discord.com/developers/applications))
- Google Gemini API Key ([Get one here](https://makersuite.google.com/app/apikey))

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your tokens:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Add documentation files:**
   - Copy your MDX files into the `documentation/` folder
   - The bot will automatically load all `.mdx` and `.md` files recursively

4. **Configure Discord Bot Permissions:**
   - Go to Discord Developer Portal > Your App > Bot
   - Enable these Privileged Gateway Intents:
     - Message Content Intent
     - Server Members Intent (optional, for better indexing)
   - Use this invite link (replace CLIENT_ID):
     ```
     https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=274877991936&scope=bot%20applications.commands
     ```

5. **Register slash commands:**
   ```bash
   npm run deploy-commands
   ```

### Running the Bot

**Start the bot:**
```bash
npm start
```

**Development mode (with auto-restart):**
```bash
npm run dev
```

## Commands

- `/help` - Show all available commands
- `/ask <question>` - Ask a question
- `/docs` - Show documentation summary
- `/stats` - Show training data statistics
- `/clear` - Clear your conversation history
- `/reload` - Reload documentation files (enkei64 only)
- `/index` - Re-index server messages (enkei64 only)

**You can also:**
- Mention the bot: `@CAPlayground AI How do I...?`
- Send a DM with any question
