# Backend API contract

What the frontend expects from the backend. Every endpoint below is already
called by the client; in development the MSW mock (`frontend/src/mocks/`)
serves the same contract, so the UI works before the backend ships.

## Conventions

- **Base URL:** `VITE_API_URL` (empty = same origin, e.g. behind nginx).
- **JSON only.** Every response is `Content-Type: application/json` (or `204`).
  The client treats anything else (an HTML page from a proxy) as an error.
- **Amounts** are TON as JSON numbers; **timestamps** ISO 8601 UTC.
- **Headers** sent on every request: `X-Requested-With: TelegramMiniApp`,
  `Authorization: Bearer <accessToken>` once signed in. Cookies are sent too
  (`withCredentials`), for a refresh-token cookie.
- **Errors:** non-2xx with `{ "error": "<machine_code>" }`. The client shows a
  generic message and keeps the code for specific ones (listed per endpoint).
- **Timeouts:** the client gives up after 15 s.

## Auth

### `POST /auth/login`

Request `{ "initData": "<Telegram WebApp initData>" }`. The server must
validate `initData` (HMAC with the bot token, `auth_date` freshness) and
identify the player from it, never from anything else the client sends.

```json
{ "accessToken": "…", "user": { "id": "u_123" } }
```

- `user.id` is how the client recognises "you" at the table (seat `player.id`).
- `accessToken` may be omitted if the session is a cookie only.
- `401` → signed out (no retry loop: login and refresh are never retried).

### `POST /refresh`

Uses the refresh cookie; returns `{ "accessToken": "…" }`. Called once per
`401` from any other endpoint, then the request is replayed. If it fails, the
client signs in again with `initData`.

### `GET /auth/me`

`{ "id": "u_123" }` (reserved; the client currently takes the id from login).

## Rooms

### `GET /rooms`

The lobby. Fetched each time the menu opens (fresh seat counts).

```json
[
  {
    "id": 1,
    "name": "Micro",
    "mode": "cash",
    "game": "nlh",
    "blinds": "0.01/0.02",
    "players": 8,
    "max": 9,
    "minBuy": 0.8,
    "maxBuy": 2
  }
]
```

- `mode`: `cash` | `heads-up`. `game`: `nlh` (No-Limit Hold'em; optional).
- `name` is shown as is (not translated). `blinds` "SB/BB" in TON.

### `GET /room/{id}/join`

`{ "wsUrl": "wss://…", "ticket": "…", "expiresIn": 30 }`: the game socket for
this table (`ticket` optional, for authenticating the socket).

## Wallet

### `GET /wallet/balance`

```json
{ "available": 42.5 }
```

`available`: spendable balance, excluding amounts reserved by pending withdrawals.

### `GET /wallet/deposit-address`

```json
{ "address": "UQA…", "memo": "1049285" }
```

Per player. The memo is what credits a transfer to this account; it must
never be shared between players (the client no longer has any built in).

### `POST /wallet/withdraw`

Request `{ "address": "UQ…", "amount": 12.5 }` → the new transaction (same
shape as in `/wallet/transactions`, `status: "pending"`).

The server re-checks everything: the address parses as TON, `amount > 0`,
`amount + fee <= available`. Errors: `invalid_address`, `invalid_amount`,
`insufficient_funds`. The client keeps the dialog open on any error.

### `GET /wallet/transactions`

Cursor pagination, newest first.

| Query    | Type                           | Notes                                    |
| -------- | ------------------------------ | ---------------------------------------- |
| `limit`  | int, 1–50, default 20          | Page size                                |
| `cursor` | string, optional               | `nextCursor` from the previous page      |
| `type`   | `deposit` \| `withdrawal`, opt | Filter; omitted = all                    |

```json
{
  "items": [
    {
      "id": "tx-57",
      "type": "deposit",
      "status": "completed",
      "amount": 25,
      "createdAt": "2026-11-07T15:20:00Z",
      "address": "UQB…GG",
      "txHash": "b7c1…f8e9",
      "fee": 0.05,
      "failureReason": "missing-memo"
    }
  ],
  "nextCursor": "eyJpZCI6InR4LTM3In0"
}
```

- `status`: `pending` | `completed` | `failed`.
- `txHash`: only once the transfer is on chain.
- `fee`: withdrawals only.
- `failureReason` (failed only): `missing-memo` | `insufficient-funds` | `rejected`.
- `nextCursor`: opaque; `null` when there is nothing older. It should be stable
  under new inserts (e.g. keyset on `(createdAt, id)`), so a deposit arriving
  while the user scrolls does not shift pages. The client also de-duplicates by
  `id` as a safety net.

## Game history (next step)

Game sessions are recorded on the client for now (`features/game-sessions`,
localStorage), which loses them across devices. Proposed endpoint:

### `GET /history/sessions?from=&to=&cursor=&limit=`

```json
{
  "items": [
    {
      "id": "s-10482-1",
      "tableId": "10482",
      "gameType": "cash",
      "format": "6-Max",
      "smallBlind": 5,
      "bigBlind": 10,
      "startedAt": "2026-11-07T15:20:00Z",
      "endedAt": "2026-11-07T16:45:00Z",
      "hands": 86,
      "buyIn": 100,
      "cashOut": 132.5,
      "net": 32.5
    }
  ],
  "summary": { "net": 124.5, "hands": 1248, "sessions": 34, "timeMs": 67320000 },
  "nextCursor": null
}
```

- One session per table sitting (multi-tabling = several sessions).
- `buyIn` = initial buy-in + all rebuys; `net = cashOut − buyIn`.
- `summary` covers the whole `from`–`to` range, not just the page.
- Wallet deposits and withdrawals are never part of these numbers.

## Game socket

JSON messages `{ "type": "...", "payload": { ... } }` over the `wsUrl` from
`/room/{id}/join`. Card codes are strings like `"As"`, `"Td"`.

### Client → server

- `CMD_PLAYER_ACTION` `{ "action": "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE",
  "amount"?: number }`. **No player id:** the server takes the player from the
  authenticated socket and must reject actions out of turn or outside
  `EV_ALLOWED_ACTIONS` (amounts in chips, re-validated).
- `CMD_REVEAL_HOLES`: dev only; must be ignored in production.

### Server → client

| Event | Payload |
| --- | --- |
| `EV_PLAYER_SEATED` | `seatIndex`, `player { id, name, avatar, stack, status }` |
| `EV_HAND_STARTED` | `dealerSeat`, `smallBlindSeat`, `bigBlindSeat`, `initialBets {seat: chips}`, `community` |
| `EV_YOUR_CARDS` | `cards [c1, c2]`: only to their owner |
| `EV_TURN_CHANGED` | `activeSeat`, `turnMs`, `timeBankMs` (see turn clock) |
| `EV_ALLOWED_ACTIONS` | `canCheck`, `canCall`, `canFold`, `callAmount`, `minRaise`, `maxRaise`: only to the acting player |
| `EV_PLAYER_ACTED` | `seat`, `action`, `amount?`, `stack`, `status` |
| `EV_STREET_CONCLUDED` | `main`, `sidePots [{ id, amount, eligibleSeatIndexes }]` |
| `EV_BOARD_DEALT` | `street`, `cards` |
| `EV_SHOWDOWN` | `revealedHands {seat: [c1, c2]}` |
| `EV_HAND_COMPLETED` | `winners [{ seatIndex, amountWon, combinationName }]` |
| `EV_DEBUG_HOLES` | dev only: everyone's cards. **Never send in production.** |

Open points for the backend:

- After `EV_HAND_COMPLETED` the client adds `amountWon` to the winner's stack
  itself; don't also send the final stack, or it is counted twice.
- There is no "player left" event yet: a leaving player stays on screen.
- Side pots must be computed server-side (the mock splits the whole pot).

### Turn clock

The client draws the turn timer from the server's numbers, so the drawn clock
and the real timeout always agree. `EV_TURN_CHANGED` carries them:

```json
{
  "type": "EV_TURN_CHANGED",
  "payload": { "activeSeat": 3, "turnMs": 15000, "timeBankMs": 10000 }
}
```

- `turnMs`: main thinking time for this turn.
- `timeBankMs`: extra time that starts when `turnMs` runs out (0 if none).
- The server times the player out after `turnMs + timeBankMs` (fold, or
  check when nothing is owed).
- Both are optional for now: without them the client falls back to 15 s +
  10 s, which can disagree with the real timeout.
