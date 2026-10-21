FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --fetch-retries=1 --fetch-timeout=30000
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --fetch-retries=1 --fetch-timeout=30000 && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node src/server ./src/server
COPY --chown=node:node src/shared ./src/shared
COPY --chown=node:node scripts ./scripts
USER node
EXPOSE 3000
CMD ["npm", "start"]
