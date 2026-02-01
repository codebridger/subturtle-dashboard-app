FROM node:22.17.1-alpine as build-stage

WORKDIR /app

COPY /frontend/package.json ./
COPY /frontend/yarn.lock ./
COPY /frontend/.npmrc ./
RUN yarn install

COPY /frontend/ .

RUN yarn generate

FROM node:22.17.1-alpine

WORKDIR /app

COPY /server/package.json ./
COPY /server/yarn.lock ./
COPY /server/.env ./

RUN yarn install

COPY /server/ .
RUN yarn build

COPY --from=build-stage /app/.output/public ./dist/public

EXPOSE 80

CMD ["yarn", "start"]