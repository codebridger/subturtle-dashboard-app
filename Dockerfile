FROM node:18-alpine as build-stage

WORKDIR /app

COPY package*.json yarn.lock ./
RUN yarn install

COPY . .

RUN yarn build

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]