FROM node:20.9.0-alpine as build-stage

WORKDIR /app

COPY package.json .env ./
COPY yarn.lock ./
COPY .npmrc ./
RUN yarn install

COPY . .

RUN yarn build

FROM node:18-alpine

WORKDIR /app
COPY --from=build-stage /app/.output /app/

EXPOSE 3000

CMD ["node", "server/index.mjs"]