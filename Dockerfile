# Aonde staging / production image. No secrets — set env at the host (Render, Railway).
FROM node:20-alpine

WORKDIR /app

COPY . .

USER node

EXPOSE 3333

CMD ["node", "scripts/serve.js"]
