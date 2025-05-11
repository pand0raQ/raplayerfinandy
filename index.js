require('dotenv').config();
const express = require('express');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// Environment variables
const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = '6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M';
const SIGNAL_URL = 'https://hook.finandy.com/yO3KJnXGQbpKnkbLrlUK';
const SIGNAL_SECRET = 'e2kici7dcc';

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

// Function to handle incoming messages
async function handleIncomingMessage(msg) {
  try {
    // Safe access of message properties using optional chaining
    const messageText = msg?.text || 'No text';
    const userId = msg?.from?.id || 'Unknown';
    const chatId = msg?.chat?.id;
    
    console.log(`Processing message: "${messageText}" from user ID: ${userId}`);
    
    // Check if chatId is valid
    if (!chatId) {
      console.error('Invalid chat ID in message:', JSON.stringify(msg));
      return;
    }

    // Check if this is a trading signal message
    // More flexible detection for different message formats
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
        await bot.sendMessage(chatId, 'Trading signal received and forwarded!');
      } catch (error) {
        console.error('Error processing incoming trading signal:', error.message);
        await bot.sendMessage(
          chatId,
          'Error processing incoming trading signal. Please check server logs.'
        );
      }
    } else {
      // For regular messages (not trading signals), use the default behavior
      try {
        await sendTradingSignal();
        
        // Acknowledge receipt to user
        await bot.sendMessage(
          chatId,
          'Trading strategy signal sent successfully!'
        );
      } catch (error) {
        console.error('Error sending trading signal:', error.message);
        
        // Try to notify the user of the error
        try {
          await bot.sendMessage(
            chatId,
            'Sorry, there was an error sending your trading signal. Please try again later.'
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

// Webhook endpoint to receive messages from Telegram
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    console.log('Received update from Telegram webhook:', JSON.stringify(update));

    // Check if it's a valid Telegram update
    if (!update || !update.message) {
      console.log('Received invalid update:', JSON.stringify(update));
      return res.sendStatus(400); // Bad request
    }

    // Process the message
    await handleIncomingMessage(update.message);
    
    // Always respond with 200 OK to Telegram
    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error);
    
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${isProduction ? 'Production' : 'Development'}`);
  
  if (isProduction) {
    console.log('Server running in webhook mode');
  } else {
    console.log('Server running in polling mode');
    console.log('You can test signal sending at http://localhost:3000/trigger-signal');
  }
}); 