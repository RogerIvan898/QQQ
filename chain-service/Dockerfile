# syntax=docker/dockerfile:1

# ---------- сборка ----------
FROM golang:1.27.3-alpine AS build
WORKDIR /src

# Сначала только зависимости — слой кешируется, пока не меняется go.mod/go.sum.
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
# Статический бинарник без cgo: запускается в scratch.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
      -o /out/chain-service ./cmd/chain-service

# ---------- runtime ----------
FROM scratch

# Корневые сертификаты нужны для amqps:// и будущих HTTPS-запросов к TON API.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/chain-service /chain-service

# Непривилегированный пользователь (nobody).
USER 65534:65534

EXPOSE 9090

# В scratch нет curl — проверку выполняет сам бинарник (GET /readyz).
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/chain-service", "healthcheck"]

ENTRYPOINT ["/chain-service"]
