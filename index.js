require('dotenv').config();
const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Environment variables
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = '6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M';
const SIGNAL_URL = 'https://hook.finandy.com/yO3KJnXGQbpKnkbLrlUK';
const SIGNAL_SECRET = 'e2kici7dcc';
// Logging service URL - this will receive all message data for debugging
const DEBUG_LOG_URL = 'https://webhook.site/0e6d09d0-4c6e-4a60-88bb-e2686b1e8d09';

// Determine environment
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.RENDER_EXTERNAL_URL;

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize Telegram bot
let bot;
if (isProduction) {
  // In production, use webhook mode
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
  
  // Improved webhook URL construction with more detailed logging
  let hostname = process.env.RENDER_EXTERNAL_URL || process.env.RENDER_EXTERNAL_HOSTNAME || 'raplayerfinandy.onrender.com';
  // Remove any https:// prefix if present
  hostname = hostname.replace(/^https?:\/\//, '');
  const webhookURL = `https://${hostname}/webhook`;
  
  console.log('Production environment detected');
  console.log(`RENDER_EXTERNAL_URL: ${process.env.RENDER_EXTERNAL_URL || 'not set'}`);
  console.log(`RENDER_EXTERNAL_HOSTNAME: ${process.env.RENDER_EXTERNAL_HOSTNAME || 'not set'}`);
  console.log(`Setting webhook to: ${webhookURL}`);
  
  // First get current webhook info
  bot.getWebHookInfo().then(info => {
    console.log('Current webhook info:', info);
    
    // Set the webhook
    return bot.setWebHook(webhookURL);
  }).then(
    () => console.log(`Webhook successfully set to ${webhookURL}`),
    (error) => console.error('Failed to set webhook:', error)
  );
  
  // Add a function to manually check webhook status
  app.get('/webhook-status', async (req, res) => {
    try {
      const info = await bot.getWebHookInfo();
      res.json({ 
        success: true, 
        webhookInfo: info,
        isConfigured: !!info.url
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: 'Error checking webhook status', 
        error: error.message 
      });
    }
  });
} else {
  // In development, use polling mode (no webhook)
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
  console.log('Bot started in polling mode for local development');
  
  // Handle incoming messages in polling mode
  bot.on('message', async (msg) => {
    console.log('Received message in polling mode:', msg);
    await handleIncomingMessage(msg);
  });
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Function to log to file
function logToFile(type, data) {
  try {
    const timestamp = new Date().toISOString();
    const logFileName = path.join(logsDir, `${type}_${timestamp.split('T')[0]}.log`);
    const logEntry = {
      timestamp,
      type,
      data
    };
    fs.appendFileSync(logFileName, JSON.stringify(logEntry, null, 2) + ',\n');
    console.log(`Logged ${type} to file: ${logFileName}`);
  } catch (error) {
    console.error('Error logging to file:', error);
  }
}

// Webhook endpoint to receive messages from Telegram
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    
    // Add super detailed logging of the entire update object
    console.log('DETAILED WEBHOOK UPDATE:', JSON.stringify(update, null, 2));
    console.log('UPDATE TYPE:', typeof update);
    console.log('HAS MESSAGE:', !!update?.message);
    console.log('HAS CHANNEL_POST:', !!update?.channel_post);
    
    // Log this update to our file
    logToFile('webhook_update', update);
    
    // Enhanced handling for different types of updates
    let messageToProcess = null;
    let sourceType = '';
    
    // Check for Finandy-specific format first
    if (update?.finandy_data) {
      console.log('Processing as Finandy data message');
      // Create a compatible format for our handler from Finandy data
      messageToProcess = {
        message_id: update.finandy_data.message_id || Date.now(),
        text: update.finandy_data.content || '',
        chat: { 
          id: process.env.ADMIN_CHAT_ID || 12345678, // Use a default or configured chat ID
          type: 'private'
        },
        from: {
          id: 0,
          first_name: 'Finandy',
          username: 'finandy_system'
        },
        date: update.finandy_data.timestamp || Math.floor(Date.now() / 1000)
      };
      sourceType = 'finandy_data';
    } else if (update?.message) {
      console.log('Processing as regular message');
      messageToProcess = update.message;
      sourceType = 'message';
    } else if (update?.channel_post) {
      console.log('Processing as channel post');
      messageToProcess = update.channel_post;
      sourceType = 'channel_post';
    } else if (update?.edited_message) {
      console.log('Processing as edited message');
      messageToProcess = update.edited_message;
      sourceType = 'edited_message';
    } else if (update?.edited_channel_post) {
      console.log('Processing as edited channel post');
      messageToProcess = update.edited_channel_post;
      sourceType = 'edited_channel_post';
    }
    
    // Process the message if we found a valid one
    if (messageToProcess) {
      console.log(`Message to process (${sourceType}):`, JSON.stringify(messageToProcess));
      
      // Log the message we're processing
      await logToDebugService('telegram_message', {
        sourceType,
        messageToProcess
      });
      
      // Special handling for Finandy data
      if (sourceType === 'finandy_data') {
        console.log('Processing Finandy data specially');
        await processFinandyData(messageToProcess, update.finandy_data);
      } 
      // Special handling for channel posts
      else if (sourceType === 'channel_post' || sourceType === 'edited_channel_post') {
        await processChannelPost(messageToProcess);
      } else {
        // Regular message handling
        await handleIncomingMessage(messageToProcess);
      }
    } else {
      console.log('No valid message found in update:', JSON.stringify(update));
      
      // Log that we couldn't find a valid message
      await logToDebugService('invalid_update', {
        reason: 'No valid message found',
        update
      });
    }
    
    // Always respond with 200 OK to Telegram
    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error);
    
    // Log the error to our debug service
    await logToDebugService('webhook_error', {
      message: error.message,
      stack: error.stack
    });
    
    // Always respond with 200 OK to Telegram even if there's an error
    // This is to prevent Telegram from disabling your webhook
    res.sendStatus(200);
    
    // Log the full error for debugging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data));
    }
  }
});

// Function to handle incoming messages
async function handleIncomingMessage(msg) {
  try {
    // Log the entire message object for debugging
    console.log('HANDLING MESSAGE OBJECT:', JSON.stringify(msg, null, 2));
    
    // Safe access of message properties using optional chaining
    // Check for forwarded messages, which can have different structures
    let messageText = '';
    
    // Try to get text from various locations in message object
    if (msg?.text) {
      messageText = msg.text;
    } else if (msg?.caption) {
      messageText = msg.caption;
    } else if (msg?.forward_text) {
      messageText = msg.forward_text;
    } else if (msg?.forward_from_message_id) {
      messageText = `Forwarded message ID: ${msg.forward_from_message_id}`;
    } else {
      messageText = 'No text';
    }
    
    const userId = msg?.from?.id || 'Unknown';
    const chatId = msg?.chat?.id;
    
    console.log(`Processing message: "${messageText}" from user ID: ${userId}, chat ID: ${chatId}`);
    
    // Check if chatId is valid
    if (!chatId) {
      console.error('Invalid chat ID in message:', JSON.stringify(msg));
      return;
    }

    // Add a 2-second timeout before processing the message
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Continuing after 2-second timeout');

    // Check if this is a trading signal message - check both text and caption fields
    if (messageText.includes('DOGEFDUSD')) {
      console.log('Detected incoming trading signal message:', messageText);
      
      const symbol = 'DOGEFDUSD'; // This is consistent
      
      // Determine if this is a buy or sell signal based on message content
      let side = 'buy'; // Default
      
      // Check for various patterns indicating a SELL signal
      if (messageText.includes('position is closed') || 
          messageText.includes('#CLOSED') || 
          messageText.includes('SHORT')) {
        side = 'sell';
      }
      
      // Forward this specific trading signal
      try {
        await sendSpecificTradingSignal(symbol, side);
        // Log successful processing
        console.log(`Successfully processed signal: ${symbol} ${side}`);
        
        // Send a minimal acknowledgment
        await bot.sendMessage(chatId, '✓');
      } catch (error) {
        console.error('Error processing incoming trading signal:', error.message);
        await bot.sendMessage(
          chatId,
          'Error processing signal. Check logs.'
        );
      }
    } else {
      // For regular messages (not trading signals), use the default behavior
      try {
        await sendTradingSignal();
        console.log('Default trading signal sent successfully');
        
        // Send a minimal acknowledgment
        await bot.sendMessage(chatId, '✓');
      } catch (error) {
        console.error('Error sending trading signal:', error.message);
        
        // Try to notify the user of the error
        try {
          await bot.sendMessage(
            chatId,
            'Error sending signal'
          );
        } catch (sendError) {
          console.error('Failed to send error message to user:', sendError.message);
        }
      }
    }
  } catch (error) {
    console.error('Unexpected error in handleIncomingMessage:', error);
  }
}

// Function to send a specific trading signal
async function sendSpecificTradingSignal(symbol, side) {
  try {
    const signalData = {
      name: "Replayer",
      secret: SIGNAL_SECRET,
      symbol: symbol,
      side: side
    };

    console.log('Sending specific signal:', JSON.stringify(signalData));
    
    const response = await axios.post(SIGNAL_URL, signalData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('Specific signal sent successfully:');
    console.log(`Status: ${response.status}`);
    console.log(`Response data: ${JSON.stringify(response.data)}`);
    
    return response.data;
  } catch (error) {
    console.error('Error sending specific trading signal:');
    
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      console.error('No response received from server');
    } else {
      console.error('Error setting up request:', error.message);
    }
    
    throw error;
  }
}

// Function to send trading signal
async function sendTradingSignal() {
  try {
    const signalData = {
      name: "Replayer",
      secret: SIGNAL_SECRET,
      symbol: "DOGEFDUSD",
      side: "buy"
    };

    console.log('Sending signal:', JSON.stringify(signalData));
    
    // Log more request details for debugging
    console.log(`Sending POST request to: ${SIGNAL_URL}`);
    console.log(`With headers: ${JSON.stringify({ 'Content-Type': 'application/json' })}`);
    
    const response = await axios.post(SIGNAL_URL, signalData, {
      headers: {
        'Content-Type': 'application/json'
      },
      // Add timeout and more detailed error handling
      timeout: 10000
    });
    
    console.log('Signal sent successfully:');
    console.log(`Status: ${response.status}`);
    console.log(`Response data: ${JSON.stringify(response.data)}`);
    
    return response.data;
  } catch (error) {
    console.error('Error sending trading signal:');
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
      console.error(`Response headers: ${JSON.stringify(error.response.headers)}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
      console.error(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error setting up request:', error.message);
    }
    
    throw error;
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Trading Bot Server is running!');
});

// Helper endpoint to manually trigger a signal (useful for testing)
app.get('/trigger-signal', async (req, res) => {
  try {
    const result = await sendTradingSignal();
    res.json({ success: true, message: 'Signal sent successfully', result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error sending signal', error: error.message });
  }
});

// API endpoint to receive signals from external systems
app.post('/api/signal', async (req, res) => {
  try {
    console.log('Received API signal request:', JSON.stringify(req.body, null, 2));
    
    // Extract signal data from request body
    const { symbol, side, message } = req.body;
    
    // Default to DOGEFDUSD if no symbol provided
    const signalSymbol = symbol || 'DOGEFDUSD';
    
    // Default to buy if no side provided
    let signalSide = side || 'buy';
    
    // If a message is provided, try to determine side from message content
    if (message) {
      if (message.includes('position is closed') || 
          message.includes('#CLOSED') || 
          message.includes('SHORT')) {
        signalSide = 'sell';
      }
    }
    
    // Log the signal being processed
    console.log(`Processing API signal: ${signalSymbol} ${signalSide}`);
    
    // Send the trading signal
    const result = await sendSpecificTradingSignal(signalSymbol, signalSide);
    
    // Return success response
    res.json({ 
      success: true, 
      message: 'Signal processed successfully', 
      signal: {
        symbol: signalSymbol,
        side: signalSide
      },
      result 
    });
  } catch (error) {
    console.error('Error processing API signal:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing signal', 
      error: error.message 
    });
  }
});

// API endpoint to process raw message text
app.post('/api/raw-message', async (req, res) => {
  try {
    console.log('Received raw message request:', JSON.stringify(req.body, null, 2));
    
    // Extract the message text from the request body
    const { message, text, content } = req.body;
    
    // Try to get the message text from various possible fields
    const messageText = message || text || content || '';
    
    if (!messageText) {
      return res.status(400).json({
        success: false,
        message: 'No message text provided. Please include "message", "text", or "content" field.'
      });
    }
    
    console.log(`Processing raw message text: "${messageText}"`);
    
    // Check if this is a trading signal
    if (messageText.includes('DOGEFDUSD')) {
      console.log('Detected trading signal in raw message');
      
      const symbol = 'DOGEFDUSD';
      
      // Determine if this is a buy or sell signal
      let side = 'buy'; // Default
      if (messageText.includes('position is closed') || 
          messageText.includes('#CLOSED') || 
          messageText.includes('SHORT')) {
        side = 'sell';
      }
      
      // Process the trading signal
      const result = await sendSpecificTradingSignal(symbol, side);
      console.log(`Successfully processed raw message signal: ${symbol} ${side}`);
      
      // Return success response
      res.json({
        success: true,
        message: 'Signal processed successfully',
        signal: {
          symbol,
          side
        },
        result
      });
    } else {
      // No trading signal found in the message
      console.log('No trading signal found in raw message');
      res.status(400).json({
        success: false,
        message: 'No trading signal found in the provided message'
      });
    }
  } catch (error) {
    console.error('Error processing raw message:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing message',
      error: error.message
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${isProduction ? 'Production' : 'Development'}`);
  
  if (isProduction) {
    console.log('Server running in webhook mode');
    
    // Schedule regular checks to log activity (every 5 minutes)
    setInterval(() => {
      console.log(`[${new Date().toISOString()}] Server alive check - waiting for webhook events`);
      
      // Check webhook status periodically
      bot.getWebHookInfo().then(info => {
        console.log('Current webhook info:', info);
        console.log(`Pending updates: ${info.pending_update_count}`);
      }).catch(err => {
        console.error('Error checking webhook status:', err);
      });
    }, 5 * 60 * 1000); // Every 5 minutes
    
    // Initial check
    console.log(`[${new Date().toISOString()}] Initial server check`);
  } else {
    console.log('Server running in polling mode');
    console.log('You can test signal sending at http://localhost:3000/trigger-signal');
  }
});

// Add a test endpoint that can be used to verify the server is reachable
app.get('/test', (req, res) => {
  console.log(`[${new Date().toISOString()}] Test endpoint accessed`);
  res.json({
    status: 'ok',
    message: 'Server is running!',
    timestamp: new Date().toISOString()
  });
});

// Add a webhook debug endpoint that simulates receiving a message
app.get('/debug-webhook', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Debug webhook endpoint accessed`);
    
    // Create a simulated message
    const simulatedUpdate = {
      message: {
        message_id: 12345,
        from: {
          id: 54321,
          first_name: 'Debug',
          last_name: 'User'
        },
        chat: {
          id: 54321,
          first_name: 'Debug',
          last_name: 'User',
          type: 'private'
        },
        date: Math.floor(Date.now() / 1000),
        text: 'DOGEFDUSD Test message'
      }
    };
    
    console.log('Simulating webhook with update:', JSON.stringify(simulatedUpdate, null, 2));
    
    // Process this simulated update
    if (simulatedUpdate.message) {
      await handleIncomingMessage(simulatedUpdate.message);
      res.json({
        status: 'ok',
        message: 'Debug webhook processed successfully',
        update: simulatedUpdate
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Invalid simulated update'
      });
    }
  } catch (error) {
    console.error('Error in debug webhook:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error processing debug webhook',
      error: error.message
    });
  }
});

// Function to process channel posts
async function processChannelPost(post) {
  try {
    console.log('Processing channel post:', JSON.stringify(post, null, 2));
    
    // Extract text from various possible locations
    const text = post?.text || post?.caption || 'No text';
    const channelId = post?.chat?.id;
    const channelTitle = post?.chat?.title || 'Unknown channel';
    
    console.log(`Channel post from "${channelTitle}" (${channelId}): "${text}"`);
    
    // Check if this post contains trading signal info
    if (text.includes('DOGEFDUSD')) {
      console.log('Detected trading signal in channel post:', text);
      
      const symbol = 'DOGEFDUSD';
      
      // Determine if this is a buy or sell signal
      let side = 'buy'; // Default
      if (text.includes('position is closed') || 
          text.includes('#CLOSED') || 
          text.includes('SHORT')) {
        side = 'sell';
      }
      
      // Process the trading signal
      await sendSpecificTradingSignal(symbol, side);
      console.log(`Successfully processed channel signal: ${symbol} ${side}`);
      
      // No confirmation message since this is a channel post
    } else {
      console.log('Channel post does not contain a trading signal');
    }
  } catch (error) {
    console.error('Error processing channel post:', error);
  }
}

// Replace or update the logToDebugService function
async function logToDebugService(type, data) {
  try {
    // Log to file (new method)
    logToFile(type, data);
    
    // Try the old URL just in case, but don't fail if it doesn't work
    try {
      const url = DEBUG_LOG_URL;
      await axios.post(url, {
        type,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.log('Debug service unavailable, using file logging only');
    }
  } catch (error) {
    console.error('Error in logToDebugService:', error);
  }
}

// Add a chatID test endpoint
app.get('/test-chat/:chatId', async (req, res) => {
  try {
    const chatId = req.params.chatId;
    console.log(`Testing chat with ID: ${chatId}`);
    
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID is required'
      });
    }
    
    // Test sending a message to this chat
    const result = await bot.sendMessage(chatId, 'Test message from your bot!');
    
    // Log the result to our debug service
    await logToDebugService('test_chat_result', result);
    
    res.json({
      success: true,
      message: 'Test message sent',
      result
    });
  } catch (error) {
    console.error('Error testing chat:', error);
    
    // Log the error to our debug service
    await logToDebugService('test_chat_error', {
      chatId: req.params.chatId,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error testing chat',
      error: error.message
    });
  }
});

// Add a signal test endpoint that will send a signal through the Telegram API
app.get('/test-signal/:signalType', async (req, res) => {
  try {
    const signalType = req.params.signalType || 'buy';
    console.log(`Testing signal of type: ${signalType}`);
    
    // Get webhook info to get the bot's chat ID
    const webhookInfo = await bot.getWebHookInfo();
    
    // Log the webhook info
    console.log('Current webhook info:', webhookInfo);
    await logToDebugService('webhook_info', webhookInfo);
    
    // Test signal messages
    const testMessages = {
      buy: '🚀 DOGEFDUSD spot 604017\n        LONG position is opened\n        $0.06 #OPENED',
      sell: '🥳 DOGEFDUSD spot 604017\n        LONG position is closed\n        $0.06 #CLOSED'
    };
    
    // Create a test message (self-sent message to the bot)
    const testMessage = testMessages[signalType] || testMessages.buy;
    
    // Log what we're going to do
    console.log(`Testing with message: ${testMessage}`);
    await logToDebugService('test_signal', {
      signalType,
      testMessage
    });
    
    // Simulate processing this message
    const simulatedMessage = {
      message_id: Math.floor(Math.random() * 1000),
      from: {
        id: 12345,
        is_bot: false,
        first_name: 'Test',
        last_name: 'User'
      },
      chat: {
        id: 12345,
        first_name: 'Test',
        last_name: 'User',
        type: 'private'
      },
      date: Math.floor(Date.now() / 1000),
      text: testMessage
    };
    
    // Process the simulated message
    await handleIncomingMessage(simulatedMessage);
    
    res.json({
      success: true,
      message: 'Test signal processed',
      signalType,
      testMessage
    });
  } catch (error) {
    console.error('Error testing signal:', error);
    
    // Log the error to our debug service
    await logToDebugService('test_signal_error', {
      signalType: req.params.signalType,
      message: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error testing signal',
      error: error.message
    });
  }
});

// Add an endpoint to view logs
app.get('/logs', (req, res) => {
  try {
    const fileType = req.query.type || 'webhook_update'; // Default to webhook updates
    const date = req.query.date || new Date().toISOString().split('T')[0]; // Default to today
    const logFileName = path.join(logsDir, `${fileType}_${date}.log`);
    
    if (fs.existsSync(logFileName)) {
      // Read the log file
      const logData = fs.readFileSync(logFileName, 'utf8');
      
      // Format as readable JSON
      const logs = logData
        .split(',\n')
        .filter(log => log.trim()) // Filter out empty lines
        .map(log => {
          try {
            return JSON.parse(log);
          } catch (e) {
            return { error: 'Failed to parse log entry', raw: log };
          }
        });
      
      // Provide simple HTML UI
      res.send(`
        <html>
          <head>
            <title>Bot Logs</title>
            <style>
              body { font-family: sans-serif; margin: 20px; }
              pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow: auto; }
              .controls { margin-bottom: 20px; }
              select, input, button { padding: 8px; margin-right: 10px; }
            </style>
          </head>
          <body>
            <h1>Telegram Bot Logs</h1>
            <div class="controls">
              <form action="/logs" method="get">
                <select name="type">
                  <option value="webhook_update" ${fileType === 'webhook_update' ? 'selected' : ''}>Webhook Updates</option>
                  <option value="telegram_message" ${fileType === 'telegram_message' ? 'selected' : ''}>Telegram Messages</option>
                  <option value="webhook_error" ${fileType === 'webhook_error' ? 'selected' : ''}>Webhook Errors</option>
                </select>
                <input type="date" name="date" value="${date}">
                <button type="submit">View Logs</button>
              </form>
            </div>
            <h2>${logs.length} Logs Found</h2>
            <pre>${JSON.stringify(logs, null, 2)}</pre>
          </body>
        </html>
      `);
    } else {
      res.status(404).send(`
        <html>
          <head>
            <title>Bot Logs</title>
            <style>
              body { font-family: sans-serif; margin: 20px; }
              .controls { margin-bottom: 20px; }
              select, input, button { padding: 8px; margin-right: 10px; }
            </style>
          </head>
          <body>
            <h1>Telegram Bot Logs</h1>
            <div class="controls">
              <form action="/logs" method="get">
                <select name="type">
                  <option value="webhook_update">Webhook Updates</option>
                  <option value="telegram_message">Telegram Messages</option>
                  <option value="webhook_error">Webhook Errors</option>
                </select>
                <input type="date" name="date" value="${date}">
                <button type="submit">View Logs</button>
              </form>
            </div>
            <h2>No logs found for ${fileType} on ${date}</h2>
          </body>
        </html>
      `);
    }
  } catch (error) {
    res.status(500).send(`Error retrieving logs: ${error.message}`);
  }
});

// Add an API endpoint to get logs as JSON
app.get('/api/logs', (req, res) => {
  try {
    const fileType = req.query.type || 'webhook_update';
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const logFileName = path.join(logsDir, `${fileType}_${date}.log`);
    
    if (fs.existsSync(logFileName)) {
      const logData = fs.readFileSync(logFileName, 'utf8');
      const logs = logData
        .split(',\n')
        .filter(log => log.trim())
        .map(log => {
          try {
            return JSON.parse(log);
          } catch (e) {
            return { error: 'Failed to parse log entry', raw: log };
          }
        });
      
      res.json(logs);
    } else {
      res.status(404).json({ error: 'No logs found for the specified date and type' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add an endpoint for testing different types of webhook messages
app.get('/test-webhook', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Test Webhook</title>
        <style>
          body { font-family: sans-serif; margin: 20px; max-width: 800px; }
          textarea { width: 100%; height: 200px; margin-bottom: 10px; }
          button { padding: 10px; margin-right: 10px; }
          .response { background: #f4f4f4; padding: 10px; border-radius: 5px; margin-top: 20px; }
          h2 { color: #333; }
        </style>
      </head>
      <body>
        <h1>Webhook Tester</h1>
        <p>Use this page to simulate different types of webhook payloads to test your bot handling.</p>
        
        <h2>Message Payload</h2>
        <textarea id="payload">{
  "update_id": 123456789,
  "message": {
    "message_id": 123,
    "from": {
      "id": 12345678,
      "first_name": "Test",
      "username": "testuser"
    },
    "chat": {
      "id": 12345678,
      "first_name": "Test",
      "username": "testuser",
      "type": "private"
    },
    "date": 1612345678,
    "text": "DOGEFDUSD testing"
  }
}</textarea>
        
        <div>
          <button id="send">Send Test Webhook</button>
          <button id="preset-message">Regular Message</button>
          <button id="preset-channel">Channel Post</button>
          <button id="preset-edited">Edited Message</button>
          <button id="preset-finandy">Finandy Message</button>
        </div>
        
        <div class="response" id="response">
          <h2>Response</h2>
          <pre>No response yet</pre>
        </div>
        
        <script>
          document.getElementById('send').addEventListener('click', async () => {
            const payload = JSON.parse(document.getElementById('payload').value);
            const response = await fetch('/webhook', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });
            
            document.querySelector('#response pre').textContent = 
              "Status: " + response.status + " " + response.statusText + "\\n" +
              "Response: " + await response.text();
          });
          
          document.getElementById('preset-message').addEventListener('click', () => {
            document.getElementById('payload').value = JSON.stringify({
              update_id: 123456789,
              message: {
                message_id: 123,
                from: {
                  id: 12345678,
                  first_name: "Test",
                  username: "testuser"
                },
                chat: {
                  id: 12345678,
                  first_name: "Test",
                  username: "testuser",
                  type: "private"
                },
                date: 1612345678,
                text: "DOGEFDUSD testing"
              }
            }, null, 2);
          });
          
          document.getElementById('preset-channel').addEventListener('click', () => {
            document.getElementById('payload').value = JSON.stringify({
              update_id: 123456789,
              channel_post: {
                message_id: 123,
                chat: {
                  id: -1001234567890,
                  title: "Test Channel",
                  type: "channel"
                },
                date: 1612345678,
                text: "DOGEFDUSD testing from channel"
              }
            }, null, 2);
          });
          
          document.getElementById('preset-edited').addEventListener('click', () => {
            document.getElementById('payload').value = JSON.stringify({
              update_id: 123456789,
              edited_message: {
                message_id: 123,
                from: {
                  id: 12345678,
                  first_name: "Test",
                  username: "testuser"
                },
                chat: {
                  id: 12345678,
                  first_name: "Test",
                  username: "testuser",
                  type: "private"
                },
                date: 1612345678,
                edit_date: 1612345680,
                text: "DOGEFDUSD edited testing"
              }
            }, null, 2);
          });
          
          document.getElementById('preset-finandy').addEventListener('click', () => {
            document.getElementById('payload').value = JSON.stringify({
              update_id: 123456789,
              // Custom Finandy format - you may need to adjust this based on what you observe
              finandy_data: {
                message_id: 123,
                content: "DOGEFDUSD signal from Finandy",
                source: "finandy",
                timestamp: 1612345678
              }
            }, null, 2);
          });
        </script>
      </body>
    </html>
  `);
});

// New function to handle Finandy data
async function processFinandyData(formattedMessage, originalData) {
  try {
    console.log('Processing Finandy data:', JSON.stringify(originalData));
    
    // Check if this is a trading signal message - look for key terms
    const messageText = formattedMessage.text || '';
    
    if (messageText.includes('DOGEFDUSD')) {
      console.log('Detected incoming Finandy trading signal for DOGEFDUSD');
      
      const symbol = 'DOGEFDUSD';
      
      // Determine if this is a buy or sell signal based on message content
      let side = 'buy'; // Default
      
      // Check for various patterns indicating a SELL signal
      if (messageText.includes('position is closed') || 
          messageText.includes('#CLOSED') || 
          messageText.includes('SHORT')) {
        side = 'sell';
      }
      
      // Forward this specific trading signal
      try {
        await sendSpecificTradingSignal(symbol, side);
        console.log(`Successfully processed Finandy signal: ${symbol} ${side}`);
        
        // Log success
        logToFile('finandy_success', {
          originalData,
          processedSignal: { symbol, side }
        });
        
        return true;
      } catch (error) {
        console.error('Error processing Finandy trading signal:', error.message);
        
        // Log error
        logToFile('finandy_error', {
          error: error.message,
          originalData
        });
        
        return false;
      }
    } else {
      console.log('Finandy message does not contain expected trading signal');
      return false;
    }
  } catch (error) {
    console.error('Error in processFinandyData:', error);
    return false;
  }
} 