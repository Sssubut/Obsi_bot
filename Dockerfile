# Production-ready Multi-stage Docker Build for High Performance
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Runtime Image
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled assets from builder stage
COPY --from=builder /usr/src/app/dist ./dist
# If we need the .env file as safe template
COPY --from=builder /usr/src/app/.env.example ./

# Create default vault folders
RUN mkdir -p vault/Inbox vault/Daily

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
