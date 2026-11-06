# Two ways to build the image:
#   docker build .                     -> builds the app inside Docker (local use)
#   docker build --target prebuilt .   -> packages an existing dist/ (CI, reuses frontend:build)

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
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

FROM serve AS prebuilt
COPY dist /usr/share/nginx/html

FROM serve AS app
COPY --from=build /app/dist /usr/share/nginx/html
