# Telepathy

Think you and your twin are locked in? Everyone in a room sees half a word, for example `break ____`.
You each secretly type the other half. If you all write **dance**, that's telepathy.

Built for 2–3 players, with room for 6. Each player is a flower in a shared garden bed, and when your
answers match, your roots light up underground. Rooms with share links, a server-side clock, and
four word packs mined from real lexical data.

```
 frontend/  Next.js 16 (App Router) — home, room lobby, rounds, reveal, results
 backend/   FastAPI + WebSockets — rooms, rounds, scoring, word matching
 data/      the pipeline that builds the word packs (see data/README.md)
```

## How a game works

1. Someone clicks **Start a room** and gets a 4-letter code like `MEGB`. They share the code or the link.
2. The host picks a **station** (word pack), difficulty, number of rounds, a timer, and whether the answer
   list is visible while guessing (assist mode).
3. Each round, everyone locks in an ending in secret. The round ends when everyone has locked in or the clock runs out.
4. **Scoring**
   - Everyone matches (a *meld*): 3 points
   - +1 *deep cut* if you all matched on something other than the most common answer
   - +1 *hive mind* if the meld had 3 or more people
   - +1 per round once a streak of melds reaches 3
   - Partial match: 1 point per matching pair
5. The reveal shows every known ending with a popularity bar and coloured dots for who picked what.
6. At the end you get a **sync %** with a title (*Literally one brain* … *Different planets*), the
   strongest-linked pair, and the full tape of answers.

### Typed answers are forgiving

`sunflower`, `sun flower`, `flower` and `flowr` all count as **flower**. `make a wish` matches
`wish`. Plurals fold together. If you type something that isn't in the pack, the game warns you and
suggests close matches. You can still lock it in anyway, but a made-up match gets no deep-cut bonus.

### Rooms survive real life

- Refreshing the page or losing signal keeps your seat. Your player id is stored in the browser.
- If the host leaves, hosting passes to the next player.
- People who join mid-round sit that round out and play from the next one.
- The host can force a reveal or move on if someone goes AFK.
- Empty rooms are cleaned up after 10 minutes, and idle rooms after 2 hours.

## Run it locally

```bash
# backend
cd backend
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest -q                       # 24 tests: matching, scoring, rooms, live websockets, timer

# frontend (another terminal)
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                     # http://localhost:3000
```

To play against yourself, open a normal window and a private window.

## Deploy (free tier)

Vercel can't hold WebSockets open, so the game is split into two deploys.

**1. Game server → Render**
- On render.com, choose New → Blueprint and pick this repo. `render.yaml` sets up `backend/`.
- When it's live, copy the URL, e.g. `https://telepathy-api.onrender.com`.
- Free Render instances sleep after ~15 minutes idle and take ~50s to wake. The frontend shows
  "waking the tower…" and keeps retrying, so the first person in just waits a bit. For no
  sleep, use the Dockerfile on Fly.io or Railway, or a paid Render plan.

**2. Website → Vercel**
- Import the repo on vercel.com and set the **Root Directory** to `frontend`.
- Add the environment variable `NEXT_PUBLIC_API_URL` = your Render URL. No trailing slash. `wss://` is derived from it.
- Deploy.

**3. Lock it down (optional)**
- On Render, set `ALLOWED_ORIGINS` to your Vercel URL.

> Rooms live in memory, so run **one** server process. Scaling past that would need Redis for room state.
> At party-game scale, one small instance handles hundreds of rooms.

## Putting it in the portfolio later

The frontend is self-contained: `app/room/[code]`, `components/`, `lib/` and the styles in `globals.css`.
To embed it in the portfolio's Next.js app, copy those across under a route like `/play/telepathy`, then
point `NEXT_PUBLIC_API_URL` at the same Render server.
