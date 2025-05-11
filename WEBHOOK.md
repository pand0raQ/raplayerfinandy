# Fixing Telegram Bot Webhook Issues

If your Telegram bot isn't responding to messages, it's likely that the webhook isn't set correctly. This guide will help you fix that.

## Check Current Webhook Status

To check if your webhook is properly set:

```
https://api.telegram.org/bot6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M/getWebhookInfo
```

Visit this URL in your browser. If you see an empty URL in the response, the webhook is not set.

## Using the Fix-Webhook Script

We've created a script to automatically fix your webhook:

1. Make sure you know your Render.com URL. It should look like: `https://raplayerfinandy.onrender.com`

2. Run this command, replacing YOUR_RENDER_URL with your actual URL:

```
npm run fix-webhook -- https://your-app-name.onrender.com
```

Example:
```
npm run fix-webhook -- https://raplayerfinandy.onrender.com
```

3. After running the script, check the webhook status again to verify it's correctly set.

## Manual Webhook Setup

If the script doesn't work, you can set the webhook manually:

1. First, delete any existing webhook:
```
https://api.telegram.org/bot6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M/deleteWebhook
```

2. Then set a new webhook (replace YOUR_RENDER_URL with your actual URL):
```
https://api.telegram.org/bot6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M/setWebhook?url=https://YOUR_RENDER_URL/webhook
```

3. Check if the webhook is now set correctly:
```
https://api.telegram.org/bot6920059388:AAF4NxnG6hGc2B0CkWSxceOXLAROJF9UI4M/getWebhookInfo
```

## Testing After Webhook Is Set

1. Send a message to your bot (@finandy156842bot)
2. You should get a response from the bot
3. Check your server logs on Render.com for any errors

## Common Issues

1. **Wrong URL**: Make sure your Render.com URL is correct
2. **Missing /webhook**: The webhook URL must end with /webhook
3. **HTTP vs HTTPS**: Telegram only accepts HTTPS webhook URLs
4. **Server not running**: Make sure your server is running on Render.com 