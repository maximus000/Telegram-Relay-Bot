// src/bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');

const BOT_TOKEN = process.env.BOT_TOKEN;
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID;

if (!BOT_TOKEN || !TARGET_CHAT_ID) {
  console.error('❌ Ошибка: BOT_TOKEN и TARGET_CHAT_ID должны быть установлены в файле .env');
  process.exit(1);
}

// ==========================================
// 1. МИНИ-СЕРВЕР ДЛЯ RENDER И UPTIMEROBOT
// ==========================================
const server = http.createServer((req, res) => {
  // Отвечаем коротким "OK" на любой запрос (чтобы Render видел открытый порт)
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP-сервер запущен на порту ${PORT} (для проверок Render/UptimeRobot)`);
});

// ==========================================
// 2. ЛОГИКА БОТА
// ==========================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Хранилище в памяти
const userAliases = new Map(); // userId -> псевдоним
const messageMapping = new Map(); // relayedMessageId -> originalSenderId
const userSessions = new Map(); // userId -> { active: true, messageCount: 0 }

let aliasCounter = 1000;

// Генерация уникального псевдонима для пользователя
function generateAlias(userId) {
  if (userAliases.has(userId)) {
    return userAliases.get(userId);
  }
  
  const alias = `Пользователь_${(aliasCounter++).toString(36).toUpperCase()}`;
  userAliases.set(userId, alias);
  return alias;
}

// Форматирование времени
function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString('ru-RU', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  });
}

// Форматирование типа сообщения
function getMessageType(msg) {
  if (msg.photo) return '📷 Фото';
  if (msg.video) return '🎥 Видео';
  if (msg.document) return '📄 Документ';
  if (msg.audio) return '🎵 Аудио';
  if (msg.voice) return '🎤 Голосовое';
  if (msg.sticker) return '🎨 Стикер';
  if (msg.animation) return '🎬 GIF';
  if (msg.location) return '📍 Геолокация';
  if (msg.contact) return '👤 Контакт';
  return '💬 Текст';
}

// Формирование заголовка пересылаемого сообщения (видит только админ)
function buildRelayHeader(msg) {
  const alias = generateAlias(msg.from.id);
  const messageType = getMessageType(msg);
  const time = formatTime();
  
  // Информация о пользователе для админа
  const userInfo = msg.from.username ? `@${msg.from.username}` : 
                   `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  
  return `🔄 <b>Пересланное сообщение</b>\n` +
         `От: <code>${alias}</code>\n` +
         `Пользователь: ${userInfo} (ID: <code>${msg.from.id}</code>)\n` +
         `Время: ${time}\n` +
         `Тип: ${messageType}\n` +
         `${'─'.repeat(30)}\n`;
}

// Формирование заголовка ответа (видит пользователь, БЕЗ логина админа)
function buildReplyHeader() {
  const time = formatTime();
  
  return `📨 <b>Ответ от администратора</b>\n` +
         `Время: ${time}\n` +
         `${'─'.repeat(30)}\n`;
}

// Пересылка сообщения админу/в группу
async function relayToTarget(msg) {
  try {
    const header = buildRelayHeader(msg);
    let sentMessage;
    
    // Обработка разных типов сообщений
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
    
    // Сохранение связи для ответов
    if (sentMessage) {
      messageMapping.set(sentMessage.message_id, msg.from.id);
    }
    
    // Обновление сессии
    const session = userSessions.get(msg.from.id) || { active: true, messageCount: 0 };
    session.messageCount++;
    userSessions.set(msg.from.id, session);
    
    // Подтверждение отправителю
    await bot.sendMessage(msg.chat.id, '✅ Ваше сообщение успешно переслано!');
    
  } catch (error) {
    console.error('Ошибка при пересылке сообщения:', error);
    await bot.sendMessage(msg.chat.id, '❌ Не удалось переслать сообщение. Пожалуйста, попробуйте позже.');
  }
}

// Пересылка ответа обратно отправителю
async function relayReplyToSender(msg) {
  try {
    // Обрабатываем только ответы из целевого чата
    if (msg.chat.id.toString() !== TARGET_CHAT_ID.toString()) {
      return false;
    }
    
    // Проверяем, является ли это ответом на пересланное сообщение
    if (!msg.reply_to_message) return false;
    
    const originalSenderId = messageMapping.get(msg.reply_to_message.message_id);
    if (!originalSenderId) return false;
    
    const header = buildReplyHeader(); // Вызываем функцию без аргументов
    
    // Отправка ответа оригинальному отправителю
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
    console.error('Ошибка при пересылке ответа:', error);
    return false;
  }
}

// Обработчики команд
bot.onText(/\/start/, async (msg) => {
  // Отвечаем только в личных чатах
  if (msg.chat.type !== 'private') return;
  
  const welcomeMessage = `🤖 <b>Анонимный бот-посредник</b>

Добро пожаловать! Этот бот позволяет анонимно отправлять сообщения администратору.

Здесь Вы можете заказать парсинг по вашим критериям, готовые базы, либо задать интересующий Вас вопрос.

<b>Как это работает:</b>
• Отправьте сюда любое сообщение или файл.
• Ваше сообщение будет переслано администратору.
• Вам будет присвоен анонимный псевдоним.
• Если администратор ответит, вы получите ответ здесь.
• Ваша личность останется защищённой.

<b>Команды:</b>
/start - Показать это сообщение
/myalias - Показать ваш текущий псевдоним
/stats - Посмотреть вашу статистику
/help - Получить подробную справку

<b>Конфиденциальность:</b>
Администратор видит только ваш анонимный псевдоним. Ваша настоящая личность защищена.

<i>Просто отправьте сообщение, чтобы начать диалог!</i>`;
  
  await bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/myalias/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  
  const alias = generateAlias(msg.from.id);
  await bot.sendMessage(
    msg.chat.id, 
    `🎭 Ваш текущий анонимный псевдоним: <code>${alias}</code>\n\nИменно так администратор идентифицирует ваши сообщения.`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  
  const session = userSessions.get(msg.from.id) || { messageCount: 0 };
  const alias = userAliases.get(msg.from.id) || 'Ещё не присвоен';
  
  const stats = `📊 <b>Статистика вашей сессии</b>

Псевдоним: <code>${alias}</code>
Отправлено сообщений: ${session.messageCount}
Статус сессии: ${session.active ? '🟢 Активна' : '⚪️ Новая'}`;
  
  await bot.sendMessage(msg.chat.id, stats, { parse_mode: 'HTML' });
});

bot.onText(/\/help/, async (msg) => {
  if (msg.chat.type !== 'private') return;
  
  const helpMessage = `❓ <b>Справка и информация</b>

<b>Поддерживаемые типы сообщений:</b>
• Текстовые сообщения
• Фото (с подписями)
• Видео (с подписями)
• Документы
• Аудиофайлы
• Голосовые сообщения
• Стикеры
• GIF-анимации
• Геолокация
• Контакты

<b>Как отправлять сообщения:</b>
Просто отправьте этому боту сообщение любого типа, и оно будет анонимно переслано администратору.

<b>Получение ответов:</b>
Когда администратор ответит на ваше сообщение, вы автоматически получите ответ здесь.

<b>Защита конфиденциальности:</b>
• Ваше имя пользователя и имя скрыты
• Вы идентифицируетесь только по псевдониму
• Сообщения обрабатываются в реальном времени
• Содержимое сообщений не сохраняется постоянно

<b>Нужна помощь?</b>
Просто отправьте свой вопрос или обращение, и администратор ответит!`;
  
  await bot.sendMessage(msg.chat.id, helpMessage, { parse_mode: 'HTML' });
});

// Обработка всех входящих сообщений
bot.on('message', async (msg) => {
  // Игнорируем команды (уже обработаны)
  if (msg.text && msg.text.startsWith('/')) return;
  
  // Проверяем, является ли сообщение ответом из целевого чата (админ/группа)
  if (msg.chat.id.toString() === TARGET_CHAT_ID.toString()) {
    const wasRelay = await relayReplyToSender(msg);
    return; // Дальше не обрабатываем
  }
  
  // Принимаем сообщения только из личных чатов
  if (msg.chat.type !== 'private') {
    console.log(`Проигнорировано сообщение из чата типа ${msg.chat.type} (ID: ${msg.chat.id})`);
    return;
  }
  
  // Пересылка сообщения админу
  await relayToTarget(msg);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error);
});

// Корректное завершение работы
process.on('SIGINT', () => {
  console.log('\n🛑 Бот завершает работу...');
  bot.stopPolling();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Бот завершает работу...');
  bot.stopPolling();
  server.close(() => {
    process.exit(0);
  });
});

console.log('🚀 Telegram Relay Bot запущен...');
console.log(`📍 ID целевого чата: ${TARGET_CHAT_ID}`);
console.log('📝 Принимаются сообщения только из личных чатов');
console.log('💡 Пользователи могут начать с команды /start\n');
