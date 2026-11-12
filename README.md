# Poker

Telegram Mini App покер-рум на TON. Монорепа: фронтенд и C++ бекенд рядом, общий CI/CD в GitLab.

```
frontend/   React 19 + Vite + effector, TanStack Router, Lingui (i18n), TON Connect
backend/    C++ сервер (CMake) — в разработке
chain-service/  Go: отправка выводов в TON и наблюдение за депозитами
deploy/     продакшен: compose для двух VPS, Cloudflare Tunnel и Pages
.gitlab-ci.yml
```

## Фронтенд

Нужны Node ≥ 22.19 и [Bun](https://bun.sh) 1.4.

```bash
cd frontend
cp .env.example .env.local
bun install
bun run dev            # http://localhost:5000, по умолчанию с мок-сервером (MSW)
```

| Команда | Что делает |
|---|---|
| `bun run dev` | дев-сервер Vite |
| `bun run build` | типчек + прод-сборка в `dist/` |
| `bun run test` | все `src/**/*.test.ts` |
| `bun run lint` / `format:check` | eslint / prettier |
| `bun run fix` | автоисправление prettier + eslint |
| `bun run i18n:extract` → `i18n:compile` | обновить и скомпилировать переводы |

Переменные окружения — в [`frontend/.env.example`](frontend/.env.example).

Pre-commit хук (husky + lint-staged) форматирует и линтит изменённые файлы.

## Бекенд

Собирается через CMake; CI подхватит его автоматически, как только появятся `backend/CMakeLists.txt` и `backend/Dockerfile`.

## CI/CD

Пайплайн `.gitlab-ci.yml`, каждая часть монорепы собирается только при изменениях в своей папке. Чтобы экономить минуты shared-раннеров, пайплайны запускаются не на каждый пуш:

| Когда | Что бежит |
|---|---|
| пуш в `main` | `frontend:build` (prettier, eslint, `bun audit`, тесты, сборка — одна джоба), secret detection, docker-образы, деплой фронта на Cloudflare Pages |
| пуш в `dev`, другие ветки, merge request | ничего; при необходимости вручную — **Build → Pipelines → Run pipeline** |
| расписание, git-тег | SAST, dependency scanning, container scanning (+ сборка и образ на теге) |

Расписание для сканеров: **Build → Pipeline schedules → New schedule**, ветка `main`, например раз в неделю.

Образы: `registry.gitlab.com/company-group7340831/poker/<backend|chain-service>` с тегом `:latest` и `:<git-tag>` для релизов. Артефакт `frontend/dist` живёт 1 день.

Фронтенд образа не имеет: статика из `dist/` выкладывается на Cloudflare Pages джобой `frontend:cloudflare-pages` (заголовки и кэш — [`frontend/public/_headers`](frontend/public/_headers)). Как развернуть всё — [`deploy/README.md`](deploy/README.md).

Переменные сборки задаются в **Settings → CI/CD → Variables**: `VITE_APP_URL`, `VITE_API_URL`, `VITE_MOCK_SERVER=false`, `VITE_TON_NETWORK`, а для деплоя — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_PAGES_PROJECT`.

## Ветки

- `dev` — текущая разработка
- `main` — стабильная ветка, из неё собираются образы
