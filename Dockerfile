FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml tsconfig.json ./
COPY .yarn ./.yarn

RUN corepack enable
RUN yarn install

COPY . .

RUN yarn build

FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/yarn.lock ./yarn.lock
COPY --from=builder /app/.yarnrc.yml ./.yarnrc.yml
COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/dist ./dist

RUN yarn workspaces focus --production --all

EXPOSE 3000
CMD ["node", "dist/main.js"]