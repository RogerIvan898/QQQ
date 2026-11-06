# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
RUN npm i -g bun@1.3.14
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_APP_URL
ARG VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL VITE_API_URL=$VITE_API_URL
RUN bun run i18n:compile && bun run build

# --- serve ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
