#!/bin/sh
# VPS 1 — игровая. Входящие закрыты: трафик игроков приходит через исходящий
# туннель cloudflared, SSH — только из WireGuard или с адреса администратора.
#   ADMIN_NET=10.8.0.0/24 sh firewall.sh
# Docker публикует порты в обход ufw, поэтому в compose игровой VPS порты
# не публикуются вовсе.
set -eu
: "${ADMIN_NET:?set ADMIN_NET, e.g. the WireGuard subnet 10.8.0.0/24}"

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_NET" to any port 22 proto tcp
# WireGuard, если сервер VPN стоит здесь (иначе удалить строку).
ufw allow 51820/udp
ufw --force enable
ufw status verbose
