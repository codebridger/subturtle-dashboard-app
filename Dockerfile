FROM node:18-alpine as build-stage

WORKDIR /app

COPY package*.json .env ./
COPY .npmrc ./
RUN yarn install

COPY . .

RUN yarn build

FROM node:18-alpine

WORKDIR /app
COPY --from=build-stage /app/.output /app/

EXPOSE 3000

CMD ["node", "server/index.mjs"]