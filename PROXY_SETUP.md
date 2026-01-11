# Proxy Server Setup for Marble API

## Problem

The Marble API doesn't allow direct browser requests due to CORS (Cross-Origin Resource Sharing) restrictions. This means you can't call the Marble API directly from your React app.

## Solution

A backend proxy server that:
1. Receives requests from your React app (no CORS issues)
2. Forwards them to the Marble API (server-to-server, no CORS)
3. Returns the response to your React app

## Setup

### 1. Install Dependencies

Already installed! The proxy server needs:
- `express` - Web server
- `cors` - CORS middleware
- `multer` - File upload handling
- `form-data` - FormData for Node.js
- `node-fetch` - Fetch API for Node.js
- `dotenv` - Environment variables

### 2. Start the Proxy Server

In a **separate terminal**, run:

```bash
npm run server
```

Or:

```bash
node server.js
```

You should see:
```
🚀 [PROXY] Server running on http://localhost:3001
📡 [PROXY] Marble API proxy ready
```

### 3. Start Your App

In another terminal:

```bash
npm run dev
```

### 4. Test

The app will automatically use the proxy server at `http://localhost:3001/api/marble/convert`.

## How It Works

```
Browser (React App)
  ↓ (no CORS issues - same origin)
Proxy Server (localhost:3001)
  ↓ (server-to-server - no CORS)
Marble API (api.theworldlabs.com)
  ↓
Returns .spz file
  ↓
Proxy Server
  ↓
Browser (React App)
  ↓
SparkJS renders
```

## Troubleshooting

**Error: "Failed to fetch" or "CORS error"**
- Make sure the proxy server is running: `node server.js`
- Check that it's running on port 3001
- Check console for proxy server logs

**Error: "Connection refused"**
- Proxy server not running
- Start it with: `npm run server`

## For Hackathon Demo

**Option 1: Run both servers**
- Terminal 1: `npm run server` (proxy)
- Terminal 2: `npm run dev` (React app)

**Option 2: Use concurrently (if installed)**
- `npm run dev:all` (runs both)

## Production

For production, deploy the proxy server to a hosting service (Vercel, Railway, etc.) and update `VITE_MARBLE_PROXY_URL` in your `.env` file.
