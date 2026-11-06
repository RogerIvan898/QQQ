# Poker

Telegram Mini App покер-рум на TON. Монорепа: фронтенд и C++ бекенд рядом, общий CI/CD в GitLab.

```
frontend/   React 19 + Vite + effector, TanStack Router, Lingui (i18n), TON Connect
backend/    C++ сервер (CMake) — в разработке
.gitlab-ci.yml
```

## Фронтенд

Нужны Node ≥ 22.19 и [Bun](https://bun.sh) 1.3.

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

Пайплайн `.gitlab-ci.yml`, каждая часть монорепы собирается только при изменениях в своей папке:

| Этап | Джобы |
|---|---|
| lint | `frontend:lint` |
| build | `frontend:build`, `backend:build` |
| test | `frontend:test`, `backend:test` |
| secret-detection | поиск закоммиченных ключей и токенов |
| docker | сборка образов и пуш в GitLab Container Registry (только `main` и теги) |

Образы: `registry.gitlab.com/company-group7340831/poker/<frontend|backend>` с тегами `:<sha>`, `:latest` и `:<git-tag>` для релизов.

Фронтенд-образ — nginx со статикой из `dist/`; `/api` и `/ws` будут проксироваться на бекенд.

Переменные сборки задаются в **Settings → CI/CD → Variables**: `VITE_APP_URL` (обязательна), `VITE_API_URL`.

## Ветки

- `dev` — текущая разработка
- `main` — стабильная ветка, из неё собираются образы
