FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY web/ ./web/

EXPOSE 23120

ENV PORT=23120
ENV DATA_DIR=/app/data

VOLUME ["/app/data"]

CMD ["node", "server.js"]
