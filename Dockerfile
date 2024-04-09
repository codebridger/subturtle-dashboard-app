FROM node:18-alpine as build-stage

WORKDIR /app

ARG GIGET_AUTH_TOKEN
ENV GIGET_AUTH_TOKEN=$GIGET_AUTH_TOKEN

COPY package*.json yarn.lock ./
RUN yarn install

COPY . .

RUN yarn build

FROM node:18-alpine

WORKDIR /app
COPY --from=build-stage /app/.output /app/

EXPOSE 3000

CMD ["node", "server/index.mjs"]