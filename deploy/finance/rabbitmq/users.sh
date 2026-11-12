#!/bin/sh
# Пользователи сервисов и их права (vhost /). Запуск внутри контейнера:
#   docker compose exec rabbitmq sh /etc/rabbitmq/users.sh
# Идемпотентен: повторный запуск обновляет пароли и права.
# Порядок прав: configure (объявлять), write (публиковать, биндить), read (читать, биндить).
set -eu

upsert() {
  user=$1
  pass=$2
  if rabbitmqctl -q list_users | cut -f1 | grep -qx "$user"; then
    rabbitmqctl -q change_password "$user" "$pass"
  else
    rabbitmqctl -q add_user "$user" "$pass"
  fi
  rabbitmqctl -q set_user_tags "$user"
}

# chain-service объявляет exchange core.events и свои очереди
# (X, X.dlq, withdrawals.signed.retry.*), читает подписанные выводы,
# публикует депозиты и результаты выводов.
upsert chain-service "$CHAIN_SERVICE_PASS"
rabbitmqctl -q set_permissions -p / chain-service \
  '^(core\.events|(withdrawals\.signed|withdrawals\.result|deposits)(\..+)?)$' \
  '^(core\.events|(withdrawals\.signed|withdrawals\.result|deposits)(\..+)?)$' \
  '^(core\.events|withdrawals\.signed(\..+)?)$'

# Ядро (C++ game backend): публикует запросы на вывод, читает депозиты и
# результаты выводов.
upsert core "$CORE_PASS"
rabbitmqctl -q set_permissions -p / core \
  '^withdrawals\.requested(\..+)?$' \
  '^(core\.events|withdrawals\.requested(\..+)?)$' \
  '^(core\.events|deposits|withdrawals\.result)$'

# Сервис подписи: читает запросы на вывод, публикует подписанные транзакции.
# Ничего не объявляет и не видит депозиты.
upsert signer "$SIGNER_PASS"
rabbitmqctl -q set_permissions -p / signer \
  '^$' \
  '^core\.events$' \
  '^(core\.events|withdrawals\.requested)$'

rabbitmqctl -q list_permissions -p /
