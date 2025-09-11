FROM node:22-alpine AS builder

WORKDIR /app

COPY . .

RUN corepack enable
RUN yarn install

WORKDIR /app/server
RUN yarn install
RUN yarn build

FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

RUN yarn workspaces focus --production --all

EXPOSE 3000
CMD ["node", "dist/main.js"]