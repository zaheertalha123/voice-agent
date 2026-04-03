# syntax=docker/dockerfile:1.6

FROM node:20-bullseye-slim

WORKDIR /app

# Build arguments for Vite env vars
ARG VITE_WEBHOOK_SERVER_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_WEBHOOK_SERVER_URL=$VITE_WEBHOOK_SERVER_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN corepack enable && corepack prepare yarn@1.22.22 --activate
RUN npm install -g serve

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/root/.yarn \
    yarn install --frozen-lockfile

COPY . .
RUN yarn build

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
