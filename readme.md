# Telegram Anonymous Relay Bot

A Telegram bot that allows users to send anonymous messages to an admin or group. Users message the bot privately, and their messages are relayed with an anonymous alias while preserving their identity for admin reference.

## Features

- 🎭 **Anonymous Messaging**: Users are assigned unique aliases (e.g., `User_A7F3`)
- 🔒 **Privacy Protection**: Real usernames hidden from public view
- 💬 **Two-Way Communication**: Admins can reply, and responses are routed back
- 📦 **Rich Media Support**: Text, photos, videos, documents, voice, stickers, and more
- 🎯 **Private Chat Only**: Bot only accepts messages from private chats
- 📊 **Session Tracking**: Track message counts and user aliases
- ⚡ **Real-Time Relay**: Instant message forwarding

## Prerequisites

- Node.js 14.0 or higher
- A Telegram account
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)

## Installation

1. **Clone or download this project**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your credentials:
   ```env
   BOT_TOKEN=your_bot_token_here
   TARGET_CHAT_ID=your_admin_user_id_or_group_id
   ```

## Getting Your Credentials

### Bot Token

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Follow the prompts to create your bot
4. Copy the token provided

### Target Chat ID

**For Personal Admin (User ID):**
1. Message [@userinfobot](https://t.me/userinfobot)
2. Copy your user ID

**For Group:**
1. Create a group and add your bot
2. Add [@getidsbot](https://t.me/getidsbot) to the group temporarily
3. Copy the group chat ID (starts with `-100`)
4. Remove @getidsbot

Alternatively, start the bot and check console logs when you send a message to the group.

## Usage

### Start the Bot

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### User Commands

Users can interact with the bot using these commands:

- `/start` - Get welcome message and instructions
- `/myalias` - View their anonymous alias
- `/stats` - View session statistics
- `/help` - Get detailed help information

### How It Works

1. **User sends message** → Bot assigns anonymous alias → Forwards to admin/group with metadata
2. **Admin replies** (by replying to the relayed message) → Bot sends reply back to original user
3. Identity remains protected throughout the conversation

## Message Format

### Messages to Admin/Group

```
🔄 Relayed Message
From: User_A7F3
User: @username (ID: 123456789)
Time: 14:32:05
Type: 💬 Text
──────────────────────────────
[Message content]
```

### Replies to Users

```
📨 Reply from Admin/Group
Source: @admin or GroupName
Time: 14:35:12
──────────────────────────────
[Reply content]
```

## Security Features

- ✅ Only accepts messages from private chats
- ✅ Ignores group messages to prevent spam
- ✅ Anonymous aliases protect user identity
- ✅ Admin sees real user ID for accountability
- ✅ In-memory storage (no persistent data)

## Project Structure

```
telegram-relay-bot/
├── src/
│   └── bot.js          # Main bot logic
├── .env.example        # Environment template
├── .env               # Your configuration (not in git)
├── .gitignore         # Git ignore rules
├── package.json       # Project dependencies
└── README.md          # Documentation
```

## Supported Message Types

- 💬 Text messages
- 📷 Photos (with captions)
- 🎥 Videos (with captions)
- 📄 Documents
- 🎵 Audio files
- 🎤 Voice messages
- 🎨 Stickers
- 🎬 GIFs/Animations
- 📍 Location
- 👤 Contacts

## Troubleshooting

### Bot not responding
- Check if `BOT_TOKEN` is correct in `.env`
- Ensure the bot is not stopped
- Check console for error messages

### Messages not relaying
- Verify `TARGET_CHAT_ID` is correct
- For groups, ensure bot is a member
- Check bot has permission to send messages

### Replies not working
- Admin must reply to the relayed message (not send a new message)
- Check console logs for errors

## Development

The bot stores data in memory, which means:
- ✅ No database required
- ✅ Fast and lightweight
- ⚠️ Aliases reset on bot restart
- ⚠️ Message mappings cleared on restart

For production use with persistent data, consider adding a database (Redis, MongoDB, PostgreSQL).

## License

MIT License - Feel free to use and modify

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

If you encounter any issues or have questions:
1. Check this README
2. Review console logs
3. Verify your `.env` configuration
4. Check Telegram Bot API documentation

## Disclaimer

This bot is for educational purposes. Ensure you comply with Telegram's Terms of Service and your local laws when deploying bots.