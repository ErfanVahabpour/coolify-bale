# Multi-stage production build using Node.js 22 Alpine
FROM node:22-alpine AS runner

# Set production environment
ENV NODE_ENV=production

# Set application directory
WORKDIR /app

# Copy package definitions
COPY package.json package-lock.json ./

# Install production dependencies cleanly
RUN npm ci --omit=dev

# Copy application source
COPY src ./src

# Switch to standard non-root node user
USER node

# Expose default HTTP port
EXPOSE 3000

# Container healthcheck using lightweight built-in wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Start server
CMD ["node", "src/server.js"]
