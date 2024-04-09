FROM node:18-alpine as build-stage

WORKDIR /app

COPY .output .

EXPOSE 3000

CMD ["node", "server/index.mjs"]