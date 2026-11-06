# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.data/media && chown -R node:node /app/.data
USER node
EXPOSE 3000
CMD ["npm", "start"]
