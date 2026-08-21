# Debian-based image — better compatibility with sqlite3/sharp native modules
FROM node:20-slim

WORKDIR /app

# Build tools for native npm modules (sqlite3, sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8080
ENV NODE_ENV=production

CMD ["node", "cloud_server.js"]
