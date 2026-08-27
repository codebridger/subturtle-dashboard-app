FROM node:22.17.1-alpine as build-stage

WORKDIR /app

# subturtle-ui is a link:../ui dependency whose dist/ is not committed, so the library's
# source has to be in the image and gets built by frontend's postinstall. The path must stay
# ../ui relative to this WORKDIR.
COPY /ui /ui

COPY /frontend/package.json ./
COPY /frontend/yarn.lock ./
COPY /frontend/.npmrc ./
RUN yarn install

COPY /frontend/ .

# frontend/types/tiers.ts re-exports from ../../server/src/modules/subscription.
# Copy just that module so the relative import resolves during `yarn generate`.
COPY /server/src/modules/subscription /server/src/modules/subscription

# frontend/types/live-session-text.type.ts re-exports from
# ../../server/src/modules/live_session_text — copy it so generate resolves it.
COPY /server/src/modules/live_session_text /server/src/modules/live_session_text

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