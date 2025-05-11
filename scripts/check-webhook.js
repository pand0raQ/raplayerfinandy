const axios = require('axios');

// The bot token
const TOKEN = '6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M';

// Your render.com URL (replace with your actual URL)
const YOUR_RENDER_URL = process.argv[2] || 'https://raplayerfinandy.onrender.com';

async function checkAndFixWebhook() {
  try {
    console.log('Checking current webhook status...');
    
    // Get current webhook info
    const webhookInfoResponse = await axios.get(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
    const webhookInfo = webhookInfoResponse.data;
    console.log('Current webhook info:', JSON.stringify(webhookInfo, null, 2));
    
    // Check if webhook is properly set
    const correctWebhookUrl = `${YOUR_RENDER_URL}/webhook`;
    if (webhookInfo.result.url === correctWebhookUrl) {
      console.log('✅ Webhook is already correctly set to:', webhookInfo.result.url);
      return;
    }
    
    // Delete existing webhook if any
    console.log('Deleting existing webhook...');
    await axios.get(`https://api.telegram.org/bot${TOKEN}/deleteWebhook`);
    
    // Set new webhook
    console.log(`Setting new webhook to: ${correctWebhookUrl}`);
    const setWebhookResponse = await axios.post(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      url: correctWebhookUrl
    });
    console.log('Set webhook response:', JSON.stringify(setWebhookResponse.data, null, 2));
    
    // Check again to confirm
    const newWebhookInfoResponse = await axios.get(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`);
    const newWebhookInfo = newWebhookInfoResponse.data;
    console.log('Updated webhook info:', JSON.stringify(newWebhookInfo, null, 2));
    
    if (newWebhookInfo.result.url === correctWebhookUrl) {
      console.log('✅ Webhook successfully set!');
    } else {
      console.log('❌ Failed to set webhook correctly. Please check your Render.com URL.');
    }
    
  } catch (error) {
    console.error('Error checking/fixing webhook:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the function
checkAndFixWebhook(); 