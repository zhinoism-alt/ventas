FROM node:20-slim

# Install build tools needed for better-sqlite3 native bindings
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# SQLite data lives on a Railway persistent volume mounted at /data
ENV DATA_DIR=/data
ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
