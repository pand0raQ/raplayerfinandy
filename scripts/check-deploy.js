const axios = require('axios');

// Replace with your actual Render.com URL once deployed
const RENDER_URL = process.argv[2] || 'https://your-app-name.onrender.com';

async function checkDeployment() {
  try {
    console.log(`Checking deployment at ${RENDER_URL}...`);
    
    // Check health endpoint
    const healthResponse = await axios.get(RENDER_URL);
    console.log('Health check response:', healthResponse.data);
    console.log('✅ Health check successful');
    
    // Trigger a test signal
    const signalResponse = await axios.get(`${RENDER_URL}/trigger-signal`);
    console.log('Signal trigger response:', signalResponse.data);
    console.log('✅ Signal trigger successful');
    
    console.log('\n🚀 Deployment verification completed successfully!');
    console.log(`\nTelegram webhook should be set to: ${RENDER_URL}/webhook`);
    console.log(`\nManually verify with Telegram at: https://api.telegram.org/bot6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M/getWebhookInfo`);
  } catch (error) {
    console.error('❌ Deployment verification failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

checkDeployment(); 