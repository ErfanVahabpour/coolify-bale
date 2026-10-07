# coolify-bale

> Production-ready, lightweight webhook bridge connecting **Coolify** notification webhooks to **Bale Messenger** bots.

[English Documentation](README.md) | [مستندات فارسی](README.fa.md)

[![CI](https://github.com/ErfanVahabpour/coolify-bale/actions/workflows/ci.yml/badge.svg)](https://github.com/ErfanVahabpour/coolify-bale/actions/workflows/ci.yml)
[![Bale SDK](https://img.shields.io/badge/Bale%20SDK-@erfanvahabpour/bale--bot--sdk-5c6bc0?logo=npm)](https://www.npmjs.com/package/@erfanvahabpour/bale-bot-sdk)
[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Erfan%20Vahabpour-blue)](https://github.com/ErfanVahabpour)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Prerequisites](#prerequisites)
5. [Step 1: Setting up your Bale Bot](#step-1-setting-up-your-bale-bot)
6. [Step 2: Configuration (.env)](#step-2-configuration-env)
7. [Step 3: Quick Start with Docker Compose](#step-3-quick-start-with-docker-compose)
8. [Running without Docker (Node.js)](#running-without-docker-nodejs)
9. [Step 4: Configuring Coolify Notifications](#step-4-configuring-coolify-notifications)
10. [Authentication & Security](#authentication--security)
11. [Multi-Webhook Routing](#multi-webhook-routing)
12. [Testing & Verification](#testing--verification)
13. [Reverse Proxy & HTTPS Setup](#reverse-proxy--https-setup)
14. [Deploying directly inside Coolify](#deploying-directly-inside-coolify)
15. [Bale API Implementation Notes & Caveats](#bale-api-implementation-notes--caveats)
16. [Troubleshooting](#troubleshooting)
17. [Updating](#updating)
18. [License](#license)

---

## Overview

**coolify-bale** is a zero-maintenance, standalone bridge that receives webhook payloads from [Coolify](https://coolify.io) and instantly formats and forwards them to a [Bale Messenger](https://bale.ai) chat or channel.

> [!IMPORTANT]
> **Zero modifications to Coolify required!**
> You do **not** need to fork, patch, or alter Coolify. It integrates seamlessly using Coolify's built-in **Webhook Notification Channel**.

---

## Architecture

```
┌─────────────────┐
│     Coolify     │ (Self-hosted PaaS)
└────────┬────────┘
         │ HTTP POST /webhook/:id
         │ Authorization: Bearer <secret>
         ▼
┌─────────────────┐
│  coolify-bale   │ (Lightweight Bridge - Express 5, Node 22)
│  Webhook Bridge │ - Timing-safe authentication
│                 │ - HTML entity sanitization
│                 │ - Event & emoji mapping
└────────┬────────┘
         │ HTTPS POST /bot{TOKEN}/sendMessage
         │ JSON { chat_id, text, parse_mode: "HTML" }
         ▼
┌─────────────────┐
│ Bale Bot API    │ (https://tapi.bale.ai)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Bale Chat / App │ (User, Group, or Channel)
└─────────────────┘
```

---

## Features

- **Standardized Compatibility**: Works with Coolify's native Webhook notification provider out-of-the-box.
- **Multi-Tenant / Multi-Chat Support**: Configure multiple distinct webhooks (`/webhook/production`, `/webhook/staging`, `/webhook/team-dev`) forwarding to different Bale bots or chats from a single running bridge instance.
- **Timing-Safe Authentication**: Protects endpoints with Bearer secrets evaluated in constant time using SHA-256 digest comparison.
- **Safe HTML Formatting**: Strict HTML escaping on all dynamic fields (`<`, `>`, `&`, `"`, `'`) preventing markup corruption or injection.
- **Intelligent Event Formatting**: Recognizes common Coolify events (`deployment_success`, `deployment_failed`, `backup_success`, `server_reachable`, etc.) and assigns descriptive emojis and titles. Unknown events are formatted cleanly into Title Case.
- **Fail-Safe Fallbacks**: Automatically falls back to plain-text or strips unsupported parameters if the messaging API rejects specific HTML tags or link preview flags.
- **Zero Token Leakage**: Tokens and secrets are strictly redacted in error logs and never returned in API responses.
- **Production Hardened**: Runs as a non-root user in Docker Alpine, enforces request body size limits (256kb), in-memory rate limiting, and graceful termination handling (`SIGTERM`/`SIGINT`).
- **Comprehensive Automated Tests**: 100% test coverage using Node's native test runner without third-party test bloat.

---

## Prerequisites

- **Docker & Docker Compose** (Recommended for production)
- *OR* **Node.js 20+** (Node.js 22 LTS recommended) and **npm**

---

## Step 1: Setting up your Bale Bot

1. Open **Bale Messenger** on your phone, desktop, or web.
2. Search for `@BotFather` and start a conversation.
3. Send the command `/newbot` and follow the instructions to set your bot's display name and username (must end in `bot`, e.g. `coolify_alerts_bot`).
4. `@BotFather` will grant you an **HTTP API Token** (e.g. `123456789:AAH...`). Keep this safe!
5. **Get your Chat ID**:
   - For a private chat: Send `/start` or any message to your new bot.
   - For a group or channel: Add your bot to the group/channel as an Administrator.
   - You can retrieve your chat ID by querying the updates endpoint in your browser:
     ```bash
     curl https://tapi.bale.ai/bot<YOUR_BOT_TOKEN>/getUpdates
     ```
   - Look for `"chat":{"id": 123456789}` in the JSON response. That integer or string is your `baleChatId`.

---

## Step 2: Configuration (.env)

Clone the repository and create your configuration file:

```bash
git clone https://github.com/ErfanVahabpour/coolify-bale.git
cd coolify-bale
cp .env.example .env
nano .env
```

### Configuration Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Number | `3000` | Port on which the bridge HTTP server listens. |
| `HOST` | String | `0.0.0.0` | Bind host address. |
| `LOG_REQUESTS` | Boolean | `true` | Log incoming request methods, paths, and status codes. |
| `WEBHOOKS` | JSON Array | *Required* | JSON array containing one or more webhook configurations. |
| `PARSE_MODE` | String | `Markdown` | Message formatting syntax: `Markdown` (native for Bale Messenger clients) or `HTML`. |
| `INCLUDE_RAW_PAYLOAD`| Boolean | `false` | When `true`, appends the original Coolify JSON in a code block. |
| `DISABLE_LINK_PREVIEWS`| Boolean| `true` | When `true`, suppresses link previews/unfurling in Bale chats. |
| `RATE_LIMIT_WINDOW_MS`| Number | `60000` | In-memory rate limiting window in milliseconds (default 1 min). |
| `RATE_LIMIT_MAX` | Number | `60` | Maximum requests per window per IP. |
| `BALE_API_BASE_URL` | String | `https://tapi.bale.ai` | Base URL for Bale API requests. |
| `BALE_REQUEST_TIMEOUT_MS`| Number | `10000` | Timeout in ms for outbound requests to Bale. |

### Example `.env`

```env
PORT=3000
HOST=0.0.0.0
LOG_REQUESTS=true

WEBHOOKS=[{"id":"production","secret":"my_very_secure_production_secret_32chars","baleBotToken":"123456789:ABCDefghIJKlmnoPQRstuvwxYZ","baleChatId":"987654321"},{"id":"staging","secret":"my_very_secure_staging_secret_32chars","baleBotToken":"987654321:ZYXwvutSRQPonmlKJIhgfeDCBA","baleChatId":"-100123456789"}]

INCLUDE_RAW_PAYLOAD=false
DISABLE_LINK_PREVIEWS=true
```

> [!WARNING]
> Choose a strong, random string for each webhook `secret` (e.g. `openssl rand -hex 24`). Never reuse secrets across environments.

---

## Step 3: Quick Start with Docker Compose

Launch the container in the background:

```bash
docker compose up -d --build
```

View live container logs:

```bash
docker compose logs -f
```

Check the health status:

```bash
curl http://localhost:3000/health
```

Expected output:

```json
{"ok":true,"configuredWebhooks":2}
```

To stop the service cleanly:

```bash
docker compose down
```

---

## Running without Docker (Node.js)

If you prefer to run directly on the host using Node.js:

```bash
# 1. Install production dependencies
npm ci --omit=dev

# 2. Verify everything with the test suite
npm test

# 3. Start the server
npm start
```

For development with automatic reload on changes:

```bash
npm run dev
```

For process management, you can use **PM2**:

```bash
npm install -g pm2
pm2 start src/server.js --name "coolify-bale"
pm2 save
pm2 startup
```

---

## Step 4: Configuring Coolify Notifications

You can now connect Coolify to your bridge.

1. Log into your **Coolify Dashboard**.
2. Navigate to **Keys & Tokens** or **Notifications** -> **Webhook**.
3. Enable **Webhook Notifications**.
4. Configure the settings:
   - **Webhook URL**:
     ```
     https://alerts.yourdomain.com/webhook/production
     ```
     *(Or `http://<your-ip>:3000/webhook/production` if testing locally)*
   - In Coolify's notification settings, set the **Authorization Header**:
     ```
     Bearer my_very_secure_production_secret_32chars
     ```
5. Check all events you wish to receive:
   - ✅ Deployment Success
   - ✅ Deployment Failure
   - ✅ Backup Status
   - ✅ Server Unreachable / Reachable
   - ✅ Container Status
6. Click **Save** and trigger a test notification.

---

## Authentication & Security

### Bearer Token Verification

Every request to `POST /webhook/:id` must include the HTTP header:

```http
Authorization: Bearer <your-configured-secret>
```

- Secrets passed via query parameters (`?secret=...`) or body fields are **rejected**.
- Evaluation uses constant-time string comparison (`crypto.timingSafeEqual` over SHA-256 digests) to mitigate side-channel timing attacks.
- If authentication fails, the server responds with:
  ```json
  { "ok": false, "error": "Unauthorized" }
  ```
- Secrets are **never** logged, printed in error traces, or returned in response bodies.

---

## Multi-Webhook Routing

You can serve multiple teams, servers, or chats with a single bridge instance:

```json
[
  {
    "id": "production",
    "secret": "prod-secret-123",
    "baleBotToken": "BOT_TOKEN_1",
    "baleChatId": "CHAT_ID_PROD"
  },
  {
    "id": "staging",
    "secret": "stage-secret-456",
    "baleBotToken": "BOT_TOKEN_2",
    "baleChatId": "CHAT_ID_DEV_GROUP"
  }
]
```

- Endpoint for production: `POST /webhook/production`
- Endpoint for staging: `POST /webhook/staging`
- Requests to an unconfigured ID (e.g. `POST /webhook/unknown`) return `404 Not Found`.

---

## Testing & Verification

### Simulating a Coolify Webhook with `curl`

Run this command in your terminal to simulate a Coolify deployment notification:

```bash
curl -X POST http://localhost:3000/webhook/production \
  -H "Authorization: Bearer CHANGE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "deployment_success",
    "success": true,
    "application_name": "my-app",
    "project_name": "production",
    "server_name": "primary-vps",
    "message": "Deployment completed successfully",
    "fqdn": "https://example.com",
    "deployment_uuid": "dep-9a8b7c6d"
  }'
```

#### Expected Server Response:

```json
{ "ok": true }
```

#### Message Received in Bale:

```html
🚀 Deployment Success

Application: my-app
Project: my-project
Server: primary-vps

Deployment completed successfully

🔗 https://example.com

dep-9a8b7c6d
```

---

## Reverse Proxy & HTTPS Setup

For production use, terminate TLS / HTTPS in front of `coolify-bale`.

### Option A: Nginx

```nginx
server {
    server_name alerts.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/alerts.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/alerts.yourdomain.com/privkey.pem;
}

server {
    listen 80;
    server_name alerts.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

### Option B: Caddy (Automatic HTTPS)

```caddy
alerts.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## Deploying directly inside Coolify

You can even deploy `coolify-bale` as a Docker application inside Coolify itself!

1. In Coolify, create a new **Application** -> **Public Repository**.
2. Point it to this repository URL.
3. Select **Docker Compose** or **Dockerfile**.
4. Under **Environment Variables**, paste the contents of your `.env` file (`WEBHOOKS`, `PORT=3000`, etc.).
5. Set your domain (e.g. `alerts.yourdomain.com`) in Coolify.
6. Click **Deploy**. Coolify will automatically provision SSL certificates via Let's Encrypt!

---

## Bale API Implementation Notes & Caveats

The Bale Messenger Bot API is structured similarly to Telegram's Bot API, but has distinct operational characteristics:

1. **Endpoint Schema**:
   Requests are directed to `https://tapi.bale.ai/bot<TOKEN>/sendMessage`.
2. **HTML Formatting (`parse_mode: HTML`)**:
   Standard HTML elements `<b>`, `<i>`, `<code>`, `<pre>`, and `<a href="...">` are supported. Dynamic user inputs are strictly escaped before sending.
3. **Resilience Strategy**:
   - If Bale returns `400 Bad Request` related to `disable_web_page_preview`, `coolify-bale` automatically retries without that option.
   - If Bale returns an entity parsing error for HTML tags, `coolify-bale` automatically retries with plain text, ensuring alerts are never dropped.
4. **Message Length Guard**:
   Bale imposes message size limits (4096 characters). `coolify-bale` automatically truncates long messages and raw payloads safely within a 4000-character boundary.
5. **Client Modularity**:
   All Bale Bot API logic is strictly isolated in [`src/bale.js`](src/bale.js), allowing easy modification if Bale's API specs change.

---

## Troubleshooting

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `HTTP 401 Unauthorized` | Missing or incorrect `Authorization` header. | Verify Coolify sends `Authorization: Bearer <secret>`. Confirm matching secret in `.env`. |
| `HTTP 404 Not Found` | The webhook ID in the URL is unknown. | Check that the ID in `/webhook/<id>` matches an entry in your `WEBHOOKS` JSON array. |
| `HTTP 502 Bad Gateway` | Bale API failed or rejected the message. | Check server logs for `[id] Bale API error`. Verify the `baleBotToken` and `baleChatId` are valid and the bot is started in that chat. |
| `HTTP 413 Payload Too Large` | Payload exceeds 256kb. | Verify Coolify isn't sending unusually oversized build logs in custom payloads. |
| `HTTP 429 Too Many Requests` | Rate limit exceeded. | Adjust `RATE_LIMIT_MAX` or `RATE_LIMIT_WINDOW_MS` in `.env`. |
| Docker container keeps restarting | Invalid JSON syntax in `.env`. | Check `docker compose logs`. Ensure `WEBHOOKS` is valid JSON and enclosed properly. |

---

## Updating

To update an existing installation to the latest version:

```bash
git pull origin main
docker compose up -d --build
```

---

## Author

Developed by **[Erfan Vahabpour](https://github.com/ErfanVahabpour)** (<erfanvahabpour@yahoo.com>).

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
