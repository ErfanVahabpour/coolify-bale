import express from 'express';
import { fileURLToPath } from 'node:url';
import { config, loadWebhooks } from './config.js';
import { authenticateRequest } from './auth.js';
import { formatCoolifyMessage } from './formatter.js';
import { sendToBale, redactSensitive } from './bale.js';

/**
 * Creates an in-memory rate limiter middleware.
 * @param {number} windowMs
 * @param {number} maxRequests
 */
export function createRateLimiter(windowMs, maxRequests) {
  const hits = new Map();

  const intervalId = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(ip);
      }
    }
  }, Math.min(windowMs, 60000));

  if (intervalId.unref) {
    intervalId.unref();
  }

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = hits.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(ip, record);
    } else {
      record.count += 1;
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > maxRequests) {
      return res.status(429).json({
        ok: false,
        error: 'Too many requests, please try again later.',
      });
    }

    next();
  };
}

/**
 * Creates and configures the Express application.
 *
 * @param {Map<string, object>} webhooks
 * @param {object} [appConfig=config]
 * @returns {express.Express}
 */
export function createApp(webhooks, appConfig = config) {
  const app = express();

  // Basic security headers
  app.disable('x-powered-by');

  // Trust proxy for reverse proxies (Nginx, Traefik, Caddy, Coolify)
  app.set('trust proxy', 1);

  // Request logger (never logs headers, secrets, or payloads)
  if (appConfig.logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
      });
      next();
    });
  }

  // Rate limiter
  app.use(createRateLimiter(appConfig.rateLimitWindowMs, appConfig.rateLimitMax));

  // JSON Body Parser with 256kb payload limit
  app.use(express.json({ limit: '256kb' }));

  // JSON syntax and size error handler
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ ok: false, error: 'Malformed JSON payload' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: 'Payload too large (maximum 256kb)' });
    }
    next(err);
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      ok: true,
      configuredWebhooks: webhooks.size,
    });
  });

  // Webhook receiver endpoint
  app.post('/webhook/:id', async (req, res) => {
    const webhookId = req.params.id;
    const webhook = webhooks.get(webhookId);

    // 1. Unknown webhook ID
    if (!webhook) {
      return res.status(404).json({
        ok: false,
        error: 'Webhook configuration not found',
      });
    }

    // 2. Authentication: Support Bearer <secret> or ?token=<secret> / ?secret=<secret>
    const queryToken = req.query?.token || req.query?.secret;
    const isAuthorized = authenticateRequest(req.headers.authorization, webhook.secret, queryToken);
    if (!isAuthorized) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
      });
    }

    // 3. Process payload
    const payload = req.body || {};
    const eventName = payload.event || 'notification';

    try {
      const formattedMessage = formatCoolifyMessage(payload, {
        includeRawPayload: appConfig.includeRawPayload,
        parseMode: appConfig.parseMode,
      });

      await sendToBale({
        botToken: webhook.baleBotToken,
        chatId: webhook.baleChatId,
        text: formattedMessage,
        parseMode: appConfig.parseMode,
        disableLinkPreviews: appConfig.disableLinkPreviews,
        baseUrl: appConfig.baleApiBaseUrl,
        timeoutMs: appConfig.baleRequestTimeoutMs,
      });

      console.log(`[${webhook.id}] forwarded ${eventName} to Bale`);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(`[${webhook.id}] Bale API error: ${redactSensitive(err.message)}`);
      return res.status(502).json({
        ok: false,
        error: 'Failed to send notification to Bale',
      });
    }
  });

  // 404 fallback handler
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: 'Not found',
    });
  });

  // Global unexpected error handler
  app.use((err, req, res, next) => {
    console.error('Unhandled server error:', redactSensitive(err.stack || err.message));
    res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  });

  return app;
}

/**
 * Boots the application server.
 */
export function startServer() {
  let webhooks;
  try {
    webhooks = loadWebhooks();
  } catch (err) {
    console.error(`[FATAL] Configuration error: ${err.message}`);
    process.exit(1);
  }

  const app = createApp(webhooks, config);

  const server = app.listen(config.port, config.host, () => {
    console.log(`========================================`);
    console.log(` coolify-bale bridge running`);
    console.log(` Host: http://${config.host}:${config.port}`);
    console.log(` Configured Webhooks: ${webhooks.size}`);
    console.log(` Parse mode: ${config.parseMode}`);
    console.log(` Raw payload included: ${config.includeRawPayload}`);
    console.log(` Link previews disabled: ${config.disableLinkPreviews}`);
    console.log(`========================================`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;

  function handleShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\nReceived ${signal}. Gracefully shutting down...`);

    const forceExitTimeout = setTimeout(() => {
      console.error('Forcefully terminating server after timeout.');
      process.exit(1);
    }, 10000);

    if (forceExitTimeout.unref) {
      forceExitTimeout.unref();
    }

    server.close((err) => {
      if (err) {
        console.error('Error during server shutdown:', err);
        process.exit(1);
      }
      console.log('Server stopped cleanly. Goodbye.');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  return { app, server };
}

// Start server if executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
