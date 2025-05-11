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
    console.log('Processing message:', msg.text, 'from user ID:', msg.from.id);
    
    // Send trading signal
    await sendTradingSignal();
    
    // Acknowledge receipt to user
    await bot.sendMessage(
      msg.chat.id,
      'Trading strategy signal sent successfully!'
    );
  } catch (error) {
    console.error('Error handling message:', error);
    // Notify the user of the error
    await bot.sendMessage(
      msg.chat.id,
      'Sorry, there was an error sending your trading signal. Please try again later.'
    );
  }
}

// Webhook endpoint to receive messages from Telegram
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    console.log('Received update from Telegram webhook:', JSON.stringify(update));

    // Check if it's a message
    if (update.message) {
      await handleIncomingMessage(update.message);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.sendStatus(500);
  }
});

// Function to send trading signal
async function sendTradingSignal() {
  try {
    const signalData = {
      name: "Replayer",
      secret: SIGNAL_SECRET,
      side: "buy",
      symbol: "DOGEFDUSD"
    };

    console.log('Sending signal:', signalData);
    
    const response = await axios.post(SIGNAL_URL, signalData);
    console.log('Signal sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending trading signal:', error);
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