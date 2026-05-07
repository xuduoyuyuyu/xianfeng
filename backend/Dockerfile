FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
