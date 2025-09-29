// src/bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID;

if (!BOT_TOKEN || !TARGET_CHAT_ID) {
  console.error('❌ Error: BOT_TOKEN and TARGET_CHAT_ID must be set in .env file');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// In-memory storage
const userAliases = new Map(); // userId -> alias
const messageMapping = new Map(); // relayedMessageId -> originalSenderId
const userSessions = new Map(); // userId -> { active: true, messageCount: 0 }

let aliasCounter = 1000;

// Generate a unique alias for a user
function generateAlias(userId) {
  if (userAliases.has(userId)) {
    return userAliases.get(userId);
  }
  
  const alias = `User_${(aliasCounter++).toString(36).toUpperCase()}`;
  userAliases.set(userId, alias);
  return alias;
}

// Format timestamp
function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// Get chat type description
function getChatDescription(chat) {
  if (chat.type === 'private') {
    return `@${chat.username || chat.first_name || 'User'}`;
  } else if (chat.type === 'group' || chat.type === 'supergroup') {
    return chat.title || 'Group';
  }
  return 'Unknown';
}

// Format message type
function getMessageType(msg) {
  if (msg.photo) return '📷 Photo';
  if (msg.video) return '🎥 Video';
  if (msg.document) return '📄 Document';
  if (msg.audio) return '🎵 Audio';
  if (msg.voice) return '🎤 Voice';
  if (msg.sticker) return '🎨 Sticker';
  if (msg.animation) return '🎬 GIF';
  if (msg.location) return '📍 Location';
  if (msg.contact) return '👤 Contact';
  return '💬 Text';
}

// Build relay message header
function buildRelayHeader(msg) {
  const alias = generateAlias(msg.from.id);
  const messageType = getMessageType(msg);
  const time = formatTime();
  
  // Include user info for admin context
  const userInfo = msg.from.username ? `@${msg.from.username}` : 
                   `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  
  return `🔄 <b>Relayed Message</b>\n` +
         `From: <code>${alias}</code>\n` +
         `User: ${userInfo} (ID: <code>${msg.from.id}</code>)\n` +
         `Time: ${time}\n` +
         `Type: ${messageType}\n` +
         `${'─'.repeat(30)}\n`;
}

// Build reply header
function buildReplyHeader(fromChat) {
  const chatDesc = getChatDescription(fromChat);
  const time = formatTime();
  
  return `📨 <b>Reply from Admin/Group</b>\n` +
         `Source: ${chatDesc}\n` +
         `Time: ${time}\n` +
         `${'─'.repeat(30)}\n`;
}

// Relay message to target (admin/group)
async function relayToTarget(msg) {
  try {
    const header = buildRelayHeader(msg);
    
    let sentMessage;
    
    // Handle different message types
    if (msg.text) {
      const fullText = header + msg.text;
      sentMessage = await bot.sendMessage(TARGET_CHAT_ID, fullText, { 
        parse_mode: 'HTML' 
      });
    } else if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      sentMessage = await bot.sendPhoto(TARGET_CHAT_ID, photo.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.video) {
      sentMessage = await bot.sendVideo(TARGET_CHAT_ID, msg.video.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.document) {
      sentMessage = await bot.sendDocument(TARGET_CHAT_ID, msg.document.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.audio) {
      sentMessage = await bot.sendAudio(TARGET_CHAT_ID, msg.audio.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.voice) {
      sentMessage = await bot.sendVoice(TARGET_CHAT_ID, msg.voice.file_id, {
        caption: header,
        parse_mode: 'HTML'
      });
    } else if (msg.sticker) {
      await bot.sendMessage(TARGET_CHAT_ID, header, { parse_mode: 'HTML' });
      sentMessage = await bot.sendSticker(TARGET_CHAT_ID, msg.sticker.file_id);
    } else if (msg.animation) {
      sentMessage = await bot.sendAnimation(TARGET_CHAT_ID, msg.animation.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.location) {
      await bot.sendMessage(TARGET_CHAT_ID, header, { parse_mode: 'HTML' });
      sentMessage = await bot.sendLocation(TARGET_CHAT_ID, msg.location.latitude, msg.location.longitude);
    } else if (msg.contact) {
      await bot.sendMessage(TARGET_CHAT_ID, header, { parse_mode: 'HTML' });
      sentMessage = await bot.sendContact(
        TARGET_CHAT_ID, 
        msg.contact.phone_number, 
        msg.contact.first_name,
        { last_name: msg.contact.last_name }
      );
    }
    
    // Store message mapping for replies
    if (sentMessage) {
      messageMapping.set(sentMessage.message_id, msg.from.id);
    }
    
    // Update session
    const session = userSessions.get(msg.from.id) || { active: true, messageCount: 0 };
    session.messageCount++;
    userSessions.set(msg.from.id, session);
    
    // Confirm to sender
    await bot.sendMessage(msg.chat.id, '✅ Your message has been relayed successfully!');
    
  } catch (error) {
    console.error('Error relaying message:', error);
    await bot.sendMessage(msg.chat.id, '❌ Failed to relay message. Please try again later.');
  }
}

// Relay reply back to original sender
async function relayReplyToSender(msg) {
  try {
    // Only process replies from the target chat
    if (msg.chat.id.toString() !== TARGET_CHAT_ID.toString()) {
      return false;
    }
    
    // Check if this is a reply to a relayed message
    if (!msg.reply_to_message) return false;
    
    const originalSenderId = messageMapping.get(msg.reply_to_message.message_id);
    if (!originalSenderId) return false;
    
    const header = buildReplyHeader(msg.chat);
    
    // Send reply back to original sender
    if (msg.text) {
      await bot.sendMessage(originalSenderId, header + msg.text, { 
        parse_mode: 'HTML' 
      });
    } else if (msg.photo) {
      const photo = msg.photo[msg.photo.length - 1];
      await bot.sendPhoto(originalSenderId, photo.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.video) {
      await bot.sendVideo(originalSenderId, msg.video.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.document) {
      await bot.sendDocument(originalSenderId, msg.document.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.audio) {
      await bot.sendAudio(originalSenderId, msg.audio.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    } else if (msg.voice) {
      await bot.sendVoice(originalSenderId, msg.voice.file_id, {
        caption: header,
        parse_mode: 'HTML'
      });
    } else if (msg.sticker) {
      await bot.sendMessage(originalSenderId, header, { parse_mode: 'HTML' });
      await bot.sendSticker(originalSenderId, msg.sticker.file_id);
    } else if (msg.animation) {
      await bot.sendAnimation(originalSenderId, msg.animation.file_id, {
        caption: header + (msg.caption || ''),
        parse_mode: 'HTML'
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error relaying reply:', error);
    return false;
  }
}

// Command handlers
bot.onText(/\/start/, async (msg) => {
  // Only respond to private chats
  if (msg.chat.type !== 'private') return;
  
  const welcomeMessage = `
🤖 <b>Anonymous Relay Bot</b>

Welcome! This bot allows you to send messages anonymously to the admin/support team.

<b>How it works:</b>
• Send any message here (text, photos, videos, etc.)
• Your message will be forwarded to the admin
• You'll be assigned an anonymous alias
• If the admin replies, you'll receive it here
• Your identity remains protected

<b>Commands:</b>
/start - Show this message
/myalias - Show your current alias
/stats - View your statistics
/help - Get detailed help

<b>Privacy:</b>
Only your anonymous alias is visible to the admin. Your real identity is protected.

<i>Just send a message to get started!</i>
  `;
  
  await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/myalias/, async (msg) => {
  // Only respond to private chats
  if (msg.chat.type !== 'private') return;
  
  const alias = generateAlias(msg.from.id);
  await bot.sendMessage(
    msg.chat.id, 
    `🎭 Your current anonymous alias is: <code>${alias}</code>\n\nThis is how the admin identifies your messages.`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/\/stats/, async (msg) => {
  // Only respond to private chats
  if (msg.chat.type !== 'private') return;
  
  const session = userSessions.get(msg.from.id) || { messageCount: 0 };
  const alias = userAliases.get(msg.from.id) || 'Not assigned yet';
  
  const stats = `
📊 <b>Your Session Statistics</b>

Alias: <code>${alias}</code>
Messages Sent: ${session.messageCount}
Session Status: ${session.active ? '🟢 Active' : '⚪️ New'}
  `;
  
  await bot.sendMessage(msg.chat.id, stats, { parse_mode: 'HTML' });
});

bot.onText(/\/help/, async (msg) => {
  // Only respond to private chats
  if (msg.chat.type !== 'private') return;
  
  const helpMessage = `
❓ <b>Help & Information</b>

<b>Supported Message Types:</b>
• Text messages
• Photos (with captions)
• Videos (with captions)
• Documents
• Audio files
• Voice messages
• Stickers
• GIFs/Animations
• Location
• Contacts

<b>How to Send Messages:</b>
Simply send any message type to this bot, and it will be forwarded to the admin anonymously.

<b>Receiving Replies:</b>
When the admin replies to your message, you'll receive it automatically here.

<b>Privacy Protection:</b>
• Your username and name are hidden
• You're identified only by your alias
• Messages are processed in real-time
• No permanent storage of message content

<b>Need Help?</b>
Just send your question or concern, and the admin will respond!
  `;
  
  await bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'HTML' });
});

// Handle all incoming messages
bot.on('message', async (msg) => {
  // Ignore commands (already handled)
  if (msg.text && msg.text.startsWith('/')) return;
  
  // Check if message is from target chat (admin/group replying)
  if (msg.chat.id.toString() === TARGET_CHAT_ID.toString()) {
    const wasRelay = await relayReplyToSender(msg);
    return; // Don't process further
  }
  
  // Only accept messages from private chats
  if (msg.chat.type !== 'private') {
    console.log(`Ignored message from ${msg.chat.type} chat (ID: ${msg.chat.id})`);
    return;
  }
  
  // Relay message to target
  await relayToTarget(msg);
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Bot is shutting down...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Bot is shutting down...');
  bot.stopPolling();
  process.exit(0);
});

console.log('🚀 Telegram Relay Bot is running...');
console.log(`📍 Target Chat ID: ${TARGET_CHAT_ID}`);
console.log('📝 Accepting messages from private chats only');
console.log('💡 Users can start with /start command\n');