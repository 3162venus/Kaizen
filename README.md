# Kaizen — Stay In It (dont download this)

> Real-time competitive study app built for AUI students.
> Study together, earn XP, battle friends, and stay accountable.

---

## What is Kaizen?

Kaizen (改善) means *continuous improvement* in Japanese.
The app turns studying into a social, competitive experience — live rooms, XP battles, focus detection via camera, and a leaderboard that resets daily so everyone has a shot.

---

## Features

* **Live Study Rooms** — Create or join rooms by subject. See who's focusing in real time.
* **XP Battles** — Challenge a friend to a 25, 50, or 120-minute focus battle. Winner takes all XP from both sides.
* **Focus Camera** — Optional AI detection using MediaPipe FaceMesh. Detects face presence, eye openness, and head orientation. Runs 100% locally — no video ever leaves your device.
* **HP System** — Your health points drain when you skip days and recharge when you study.
* **Auto Challenges** — Daily challenges complete automatically when you hit the milestone. No manual claiming, no cheating.
* **Leaderboard** — Daily and monthly XP rankings with battle win badges.
* **Friends System** — Add friends by username or KZEN# ID. See their XP, streak, and status.
* **Guest Mode** — Browse without an account. XP disappears on refresh. No rooms, no leaderboard.
* **12 Student Themes** — 6 colors × light/dark mode.
* **Gamer Mode** — Dark neon UI, rank system (Bronze → Silver → Gold → Platinum → Legend), pixel font timer.
* **AUI-specific** — School, major, and year picker. Rooms suggested based on your year level.

---

## Tech Stack

**Frontend** — Vanilla JS, CSS custom properties, MediaPipe FaceMesh
**Backend** — Node.js, Express, WebSocket (ws), bcryptjs, jsonwebtoken
**Database** — PostgreSQL (optional — falls back to in-memory for development)

---

## Project Structure

```
kaizen/
├── frontend/
│   ├── index.html    ← All screens (intro, auth, home, focus, battles, leaderboard, friends, profile)
│   ├── style.css     ← All styles — 12 themes, student + gamer modes
│   └── app.js        ← All logic — auth, WebSocket, MediaPipe, battles, XP
└── backend/
    ├── index.js      ← Express server + WebSocket + JWT auth + battle engine
    ├── db.js         ← PostgreSQL queries (used when DB is available)
    └── package.json
```

---

## Run Locally

**Requirements:** Node.js 18+

```bash
# Terminal 1 — backend
cd kaizen/backend
npm install
node index.js
```

```bash
# Terminal 2 — frontend
cd kaizen/frontend
npx serve .
```

Open **http://localhost:3000**

The backend runs in in-memory mode by default — no database setup needed. Accounts reset when the backend restarts.

---

## Run With PostgreSQL (persistent data)

```bash
# Mac
brew install postgresql@15
brew services start postgresql@15
createdb kaizen
psql kaizen -c "CREATE USER kaizen_user WITH PASSWORD 'changeme';"
psql kaizen -c "GRANT ALL ON DATABASE kaizen TO kaizen_user;"

# Start backend with DB
DB_NAME=kaizen DB_USER=kaizen_user DB_PASSWORD=changeme node index.js
```

---

## Share on Local Network

Once the backend and frontend are running, anyone on the same WiFi can access it at:

```
http://YOUR_MAC_IP:3000
```

Find your IP with `ipconfig getifaddr en0` on Mac.

---

## Environment Variables


| Variable      | Default                            | Description                           |
| ------------- | ---------------------------------- | ------------------------------------- |
| `PORT`        | `3001`                             | Backend port                          |
| `JWT_SECRET`  | `kaizen-dev-secret-change-in-prod` | Change this in production             |
| `DB_HOST`     | `localhost`                        | PostgreSQL host                       |
| `DB_PORT`     | `5432`                             | PostgreSQL port                       |
| `DB_NAME`     | `kaizen`                           | Database name                         |
| `DB_USER`     | `kaizen_user`                      | Database user                         |
| `DB_PASSWORD` | `changeme`                         | Database password                     |
| `MAIL_USER`   | —                                 | Gmail address for verification emails |
| `MAIL_PASS`   | —                                 | Gmail app password                    |
| `APP_URL`     | `http://localhost:3000`            | Used in verification email links      |

---

## Security

* Passwords hashed with bcrypt (10 rounds)
* JWT tokens with 30-day expiry
* XP validated server-side — max 3 XP/second, cheaters get reset
* Rate limiting: 40 WebSocket messages/second per connection
* Room names unique enforced server-side
* Camera: MediaPipe runs in-browser, zero frames sent to server

---

## Status

 - in active development.
 _ vibe coding phase
---

## License

`UNLICENSED` — All rights reserved.
Do not copy, distribute, or use without permission.
