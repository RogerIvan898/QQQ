#!/bin/sh
# VPS 2 — финансовая. Из интернета закрыто всё; RabbitMQ (5672) — только с
# приватного адреса игровой VPS, SSH — только из WireGuard или с адреса администратора.
#   ADMIN_NET=10.8.0.0/24 GAME_PRIVATE_IP=10.0.0.2 sh firewall.sh
# Docker публикует порты в обход ufw, поэтому в compose они привязаны
# к PRIVATE_IP и 127.0.0.1, а не к 0.0.0.0.
set -eu
: "${ADMIN_NET:?set ADMIN_NET, e.g. the WireGuard subnet 10.8.0.0/24}"
: "${GAME_PRIVATE_IP:?set GAME_PRIVATE_IP, the game VPS private address}"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_NET" to any port 22 proto tcp
ufw allow from "$GAME_PRIVATE_IP" to any port 5672 proto tcp
ufw --force enable
ufw status verbose
