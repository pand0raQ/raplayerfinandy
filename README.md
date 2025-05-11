# Trading Bot Server

A simple server that receives Telegram bot messages and sends trading signals.

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server locally:
   ```
   npm start
   ```

## Local Development

When running locally, the server:
- Uses polling mode instead of webhooks
- Listens to messages sent directly to the bot
- Provides a test endpoint at http://localhost:3000/trigger-signal

This makes it easier to test without needing to set up tunneling or configure webhooks.

## Deployment to Render.com

### Quick Deployment

1. Click this button to deploy directly to Render:
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Manual Deployment

1. Create a new Web Service on [Render.com](https://render.com)
2. Connect your GitHub repository
3. Configure the following settings:
   - **Name**: trading-bot-server (or any name you prefer)
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or choose a paid plan for better performance)

4. Add the following environment variables in Render dashboard:
   - `NODE_ENV`: production
   - `TELEGRAM_BOT_TOKEN`: 6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M
   - `SIGNAL_URL`: https://hook.finandy.com/yO3KJnXGQbpKnkbLrlUK
   - `SIGNAL_SECRET`: e2kici7dcc

### Verifying Deployment

After your app is deployed, you can verify it's working correctly:

1. Visit your Render app URL (e.g., https://your-app-name.onrender.com) to check the health endpoint
2. Visit https://your-app-name.onrender.com/trigger-signal to manually trigger a signal
3. Run `npm run check-deploy https://your-app-name.onrender.com` to perform a complete verification

### Telegram Webhook Verification

To check if your webhook is properly configured with Telegram:

1. Visit: https://api.telegram.org/bot6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M/getWebhookInfo
2. Verify that the URL matches your Render.com app URL with "/webhook" at the end

## How It Works

1. When a message is sent to your Telegram bot (@finandy156842bot), it is received by the server
2. The server processes the message and sends a trading signal to the specified URL
3. The trading strategy is restarted based on the received signal

## Telegram Bot Information

- Bot Username: @finandy156842bot
- Bot Token: 6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M

## Trading Signal Format

The server sends the following JSON payload to the signal URL:

```json
{
  "name": "Replayer",
  "secret": "e2kici7dcc",
  "side": "buy",
  "symbol": "DOGEFDUSD"
}
``` 