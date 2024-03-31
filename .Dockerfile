FROM node:18-alpine as build-stage

WORKDIR /app

COPY package*.json yarn.lock ./
RUN yarn install

COPY . .

RUN yarn build

CMD ["node", ".output/server/index.mjs"]