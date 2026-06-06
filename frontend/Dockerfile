FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=
ARG VITE_PRO_BILLING_ENABLED=true
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_PRO_BILLING_ENABLED=${VITE_PRO_BILLING_ENABLED}
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist/ /usr/share/nginx/html/
COPY ./nginx.frontend.conf /etc/nginx/conf.d/default.conf
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
