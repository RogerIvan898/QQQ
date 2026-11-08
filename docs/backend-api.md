# Backend API: wallet and game history (proposal)

The C++ backend has no endpoints for balance, transactions or game history yet.
The frontend already talks to the contract below; until the backend ships it,
the MSW mock server (`frontend/src/mocks/wallet.ts`) serves it in development.

All amounts are TON as JSON numbers, timestamps are ISO 8601 UTC.

## `GET /wallet/balance`

```json
{ "available": 42.5 }
```

`available`: spendable balance, excluding amounts reserved by pending withdrawals.

## `GET /wallet/transactions`

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

## Game socket: turn clock

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

## Profile: nickname

The player's in-game name. It is shown in the menu and at the table (the
`name` the game socket sends for each seat), and set in Settings.

### `GET /auth/me`

```json
{ "id": "100", "nickname": "Ace King" }
```

### `POST /profile/nickname`

Request `{ "nickname": "Ace King" }` → `200 { "nickname": "Ace King" }`
(the stored, normalised value).

Validation, the same rules the client checks before sending:

- trim, collapse runs of spaces to one;
- 3–16 characters;
- letters and digits in any script, space, `.`, `-`, `_`.

Rejected input → `400 { "error": "short" | "long" | "chars" }`. The server
may add `"taken"` if nicknames must be unique. A new nickname applies from the
player's next seat at a table.
