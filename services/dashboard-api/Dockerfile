FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir -p node_modules

FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
USER nonroot:nonroot
CMD ["src/server.js"]
