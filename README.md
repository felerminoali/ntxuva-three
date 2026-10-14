# Ntuxa 3D (Ntxuva)

A 3D browser version of **Ntxuva**, the four-row mancala game played in Mozambique. In the north it is also known as *Mthadje* or *M'pale*. Built with Three.js, vanilla JavaScript, Vite and the Web Audio API, with no game engine and no external assets. All textures and sounds are generated procedurally.

## Quick start

Requires Node.js 22.5+ (the online server uses the built-in `node:sqlite`; Node 24 recommended).

```bash
npm install
npm run dev          # offline modes only: Vite dev server (http://localhost:5173)
npm run dev:online   # game server (port 8787) + Vite dev server with /ws and /api proxied
npm test             # rules engine, AI, server and i18n tests (Vitest)
npm run build        # production build into dist/
npm start            # build, then serve dist/ and the online server on http://localhost:8787
```

To play online with a friend on the same network, run `npm start` and open `http://<your-ip>:8787` on both devices (or two browser windows for testing).

## Rules implemented

The board has 4 rows. Each player owns the two rows nearest to them: an **outer (back) row** and an **inner (attacking) row**. The default board is 4 × 16 with 2 seeds per bin. You can pick 8, 9, 12, 13, 15, 16 or 24 columns in Settings; a new size applies to the next game.

1. On your turn, choose one of your non-empty bins and take all of its seeds.
2. Sow them one by one, anti-clockwise, around **your own two rows** only.
3. **Relay sowing:** if the last seed lands in a bin that already held seeds, pick up that whole bin and keep sowing.
4. If the last seed lands in an empty bin, the turn ends there:
   - **Capture:** if that bin is in your inner (attacking) row and the opponent's facing attacking bin in the same column has seeds, you take all of the opponent's seeds in that column (both their attacking and back bins). If that facing bin is empty there is no capture, even when their back bin has seeds.
   - **Optional extra bin rule** (off by default, chosen before the game: the checkbox on the Play screen, or the rule selector in the online lobby): after each capture you also take **one extra opponent bin of your choice**.
   - Otherwise, the turn simply ends.
5. **Phase 1:** you may not play a bin holding a single seed while any of your bins holds more than one.
6. **Phase 2:** once all your non-empty bins hold exactly one seed, you may play a single seed only if the next bin is empty.
7. The game ends when a player has captured all of the opponent's seeds.

### Interpretations where the source rules are silent

- South moves first.
- A capture happens only when the turn ends in an empty attacking-row bin and the opponent's facing attacking-row bin has seeds.
- With the extra bin rule, the extra bin may be any non-empty opponent bin. If only one exists it is taken automatically; if none exist there is no extra capture.
- During a long sowing lap, seeds are also dropped into the bin that was just emptied.
- A player who still has seeds but no legal move loses.
- For safety, a single turn is limited to 20,000 sowings, which ends any endless relay loop.
- **Optional move limit** (Settings, off by default): when it is reached, the player with more seeds on the board wins, or the game is a draw.

## Game modes

| Mode | Description |
|---|---|
| **Online** | Play a real person over the internet for virtual coins (see below). |
| **Local 2-player** | Two people take turns on the same device. Undo is available. |
| **vs Computer (Competitions)** | A lobby of staked competitions against computer players who feel like real people (see below). A **Friendly** card keeps the classic free game: Easy, Medium or Hard AI, playing as South or North. |
| **Practice** | Free play for both sides, with a **Hint** button that shows the AI's suggested move and a preview of where the sowing would finish. |
| **Tutorial** | 8 guided steps on a small 4 × 8 board, covering the objective, sowing, relay, capture, the optional extra bin, and phases 1 and 2. |

## Competitions against the computer

The **vs Computer** tile opens a lobby with your career card and a carousel of competitions. Each competition is a one-to-one game in a Mozambican city. You pay the entry; a win pays **twice the entry**, a draw refunds it, and a loss or resignation loses it.

| Competition | Entry | Computer skill (1–20) |
|---|---|---|
| Cuamba | 1M | 1–6 |
| Nampula | 5M | 2–8 |
| Quelimane | 10M | 3–10 |
| Tete | 25M | 5–12 |
| Chimoio | 50M | 6–13 |
| Pemba | 100M | 8–15 |
| Beira | 250M | 10–16 |
| Xai-Xai | 500M | 12–18 |
| Matola | 1B | 14–19 |
| Cidade de Maputo | 2B | 16–20 |

- **Unlocking:** a competition is open once you can pay its entry. You begin with **2M coins**, so Cuamba is the first step, and the winnings from it take you to Nampula and beyond.
- **Opponent draw:** when you enter, an animated roulette draws an opponent with a Mozambican name. Their skill is a random integer from the competition's lowest skill up to the skill that matches your rating. Some games are relaxed and others are fully matched, as when you meet different people at the table. Higher skills search deeper and make fewer random choices.
- **Career:** the database keeps each player's avatar (which you can upload), coins, rating with a rank title (Novice up to Grandmaster), games, wins and losses, win rate, total winnings, tournaments won (one trophy per competition victory) and leaderboard position.
- **Storage:** signed in, the career is saved on the server (SQLite) and the server runs the computer player. Not signed in, everything runs and is saved on the device (`localStorage`), which works even on a static host such as Vercel. Leaving an unfinished competition counts as a loss.
- The capture rule (column only, or column plus extra bin) and the **board size** (4 × 8 up to 4 × 24) are chosen in the lobby. The board size is shared with Settings, so friendly games use it too; small boards are easier to play on a phone.
- **Draw wait:** after the opponent roulette stops, the result stays on screen for `DRAW_WAIT_MS` milliseconds (default 1500). Set `DRAW_WAIT_MS` in Vercel's environment variables for the client (read at build time, so redeploy) and on the server for signed-in players.

## Lucky wheel (getting coins back)

- A **free spin** of the lucky wheel is ready every **4 hours**. Prizes range from 250K to 10M coins (smaller prizes are more likely).
- If your coins drop **below 1M** (the entry to Cuamba, the cheapest competition), the wheel is **always** ready, so you can never get stuck.
- The wheel opens by itself when you open the game and a spin is ready, and again when you are out of coins in the competitions or online lobby. It can also be opened from the gold **Spin** button in the main menu or the gift chip in either lobby.
- Signed in, the spin is drawn by the server and recorded in the coin ledger (lucky-wheel); otherwise it runs on the device.

## Online play, coins and rooms

- **Sign in** as a guest (just a name) or with **Facebook**. The profile (name, photo, coins, level, rating, wins and losses) is stored on the server; connecting Facebook to a guest profile keeps it across devices. New players start with **2,000,000 coins**.
- **Rooms:** every one-to-one game takes place in a Mozambican district or city. Both players pay the stake and the winner takes the pot (a draw refunds both). Higher stakes take you to more important places, up to the provincial capitals and finally **Cidade de Maputo**:

  | Stake | Rooms |
  |---|---|
  | 1K – 5K | Massinga, Manhiça, Vilankulo |
  | 10K – 100K | Montepuez, Gurúè, Chókwè, Ilha de Moçambique |
  | 250K – 2.5M | Xai-Xai, Inhambane, Lichinga, Pemba |
  | 5M – 100M | Chimoio, Tete, Quelimane, Nampula, Beira |
  | 500M – 2B | Matola, **Cidade de Maputo (2B)** |

  Bigger rooms also need a minimum **level** (gained by playing; wins count triple), so the richest rooms bring together the most experienced players.
- **Matchmaking:** pick a room and a capture rule (column only, or column + extra bin). You are paired with the next player waiting in the same room with the same rule; sides are random and South moves first.
- **Coins:** the lucky wheel, plus a **demo store** with free packs. Coins are purely virtual: no real money is involved and they cannot be cashed out. A leaderboard lists the richest players.
- **Fair play:** the server is authoritative; it validates every move with the same rules engine. Each turn has a clock (60 s by default). When it runs out, a random legal move is played, and after 3 time-outs the player forfeits. If a player disconnects they have 60 s to come back (the game resumes automatically), otherwise they forfeit. Leaving or resigning loses the stake.

### Server configuration

The server (`server/index.js`) uses environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `DB_PATH` | `server/data/ntuxa.db` | SQLite database file |
| `FACEBOOK_APP_ID` | — | Enables "Continue with Facebook" (create an app at developers.facebook.com and add your site's domain) |
| `FACEBOOK_APP_SECRET` | — | Optional; enables stricter token verification via `debug_token` |
| `STARTING_COINS` | `2000000` | Coins for new players |
| `DRAW_WAIT_MS` | `1500` | How long the drawn opponent stays on screen after the roulette stops (ms) |
| `AI_INTRO_MS` | `3200 + DRAW_WAIT_MS` | Pause before a competition starts (covers the opponent draw) |
| `AI_MIN_THINK_MS` | `350` | Minimum "thinking" time of a computer player |
| `AI_WORKERS` | `1` | Worker threads that compute computer moves |
| `SPIN_COOLDOWN_SECONDS` | `14400` | Time between free lucky-wheel spins (always available below 1M coins) |
| `DAILY_BONUS` | `1000` | Legacy daily bonus amount (`bonus.claim`) |
| `RAKE_PERCENT` | `0` | House cut of each pot |
| `TURN_SECONDS` | `60` | Turn clock (`0` disables it) |
| `RECONNECT_SECONDS` | `60` | Grace period after a disconnect |
| `MAX_TIMEOUTS` | `3` | Time-outs before forfeiting |
| `STORE_COOLDOWN_SECONDS` | `30` | Wait between free store packs |
| `STATIC_DIR` | `dist` | Built client served by the server |

The client connects to `/ws` on the same host. To host the client elsewhere, build it with `VITE_SERVER_URL=wss://your-server/ws`.

### Deploying (Vercel + Render)

Vercel serves only the static client; it cannot run the WebSocket server.

1. On [Render](https://render.com): **New → Blueprint**, select this repository (it uses `render.yaml`) and enter `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`.
2. On Vercel: add the environment variable `VITE_SERVER_URL=wss://<your-service>.onrender.com/ws` and redeploy.

Render's free plan sleeps after inactivity (the first connection can take about a minute) and has no persistent disk, so accounts reset on restart; see `render.yaml` for the paid-disk option.

## Languages, scenery and music

- **Language:** Portuguese or English (Settings). The default follows the browser and falls back to Portuguese.
- **Scenery:** village under a mango tree, Indian Ocean beach, Maputo market at dusk, or Gorongosa savanna at sunset (Settings → Graphics).
- **Music:** optional background music: "Mysterious African Music" by Tunetank (`public/music/mysterious-african-music.mp3`), looped through the Web Audio music volume. Check the Tunetank licence before distributing the game. If the file cannot be played, the game falls back to an original generative timbila-style piece synthesized live, inspired by the Chopi xylophone orchestras of Inhambane. Music can be turned off in Settings.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Play a bin, or choose the extra capture bin | Click / tap the bin | Arrow keys to move the focus ring, then Enter / Space |
| Rotate the camera | Drag with the left button or one finger | — |
| Zoom | Mouse wheel / pinch | — |
| Pan | Right-drag / two-finger drag | — |
| Reset the camera | **View** button | `C` |
| Skip the animation | Click anywhere / **Skip** | `S` |
| Undo | **Undo** button | `U` / Ctrl+Z |
| Hint (practice mode) | **Hint** button | `H` |
| Pause | **Pause** button (top right) | `Esc` / `P` |
| Move history | **☰** button (top left) | — |
| Player info | Click / tap a player's avatar in the top bar | `Esc` closes it |

**Top bar:**
- Each player has an avatar, name, seeds still on the board and a large captured-seed score. South is on the left and North on the right, with equal space.
- The centre shows the room's place (online) or the game mode, a **VS** emblem whose arrow points at the player to move, and the turn number.
- The active player's card glows, its avatar ring spins, and a **Turn** chip drops in. In online games the ring drains as the turn clock runs down.
- Scores update the moment seeds are captured. A thin strip under the bar shows each side's share of the seeds.
- Only the icons and avatars take clicks; the rest of the bar lets clicks through to the board. The bar resizes for phones in portrait and landscape.

Highlights:
- **Gold rings:** legal moves.
- **Red flash:** an illegal pick, with a message explaining why.
- **Red rings:** bins you can choose as the extra capture.
- **Blue:** a hint.
- **Green ring:** where the last move ended.

Hovering a legal bin previews where its sowing would end. Each bin also shows its seed count, which you can turn off in Settings.

On phones, landscape orientation gives the largest board; pinch to zoom in portrait.

## Architecture

```
index.html            screens, HUD and rules text
src/
  main.js             entry point: wires everything together, runs the render loop
  gameLogic.js        pure rules engine (no DOM, no Three.js), fully unit-tested
  ai.js               minimax + alpha-beta, iterative deepening, time budget
  aiWorker.js         Web Worker wrapper so the AI never blocks rendering
  aiClient.js         promise API around the worker (falls back to the main thread)
  game.js             GameSession: modes, turn flow, undo, hints, tutorial, end of game
  scene.js            Stage: renderer, camera, OrbitControls, lights, environment
  board.js            board geometry, pit layout and picking, highlight layers, count labels
  pieces.js           seed meshes and sowing, relay and capture animations
  animator.js         small promise-based tween engine (speed control, pause, skip)
  textures.js         procedural canvas textures (wood, mat, earth, board top)
  scenarios.js        the four sceneries (village, beach, market, savanna): ground, cloth, props, lighting
  input.js            mouse, touch and keyboard → bin picks (taps vs. camera drags)
  ui.js               menus, HUD, move history, toasts, pause and end screens
  tutorial.js         tutorial steps and their scripted positions
  audio.js            Web Audio sound effects and the background music track
  settings.js         settings persisted in localStorage
  i18n.js             Portuguese / English strings and translation helpers
  describe.js         translated player names, move descriptions and illegal-move messages
  music.js            generative timbila-style fallback music (Web Audio)
  tiers.js            online rooms (stakes, places, levels) and store packs, shared with the server
  competitions.js     competitions vs computer: ladder, 1-20 skills, opponent draw, Elo, payouts, bot names (shared with the server)
  arena.js            competition lobby, career card, avatar upload and the opponent-draw roulette
  arenaLocal.js       device career (localStorage) and the in-browser competition engine
  spin.js             lucky-wheel prizes, weights and cooldown rules (shared with the server)
  luckyWheel.js       lucky-wheel modal: SVG wheel, spin animation, auto-prompt
  net.js              WebSocket client: requests, pushes, reconnection, server clock offset
  online.js           sign-in, lobby, store, leaderboard, matchmaking, online game bridge
  facebook.js         loads the Facebook SDK on demand and logs in
  styles.css
server/
  index.js            entry point (npm run server)
  app.js              HTTP + WebSocket server: accounts, wallet, matchmaking, authoritative games
  db.js               SQLite storage (users, sessions, coin ledger, games, ratings, competition careers)
  aiPool.js           worker-thread pool that computes computer moves off the event loop
  aiWorker.js         worker thread running the AI at a given skill
  facebook.js         Facebook access-token verification (Graph API)
  config.js           environment configuration
  dev.js              runs the server and Vite together (npm run dev:online)
tests/
  gameLogic.test.js   rules: setup, sowing, relay, captures, extra bin option, phases, game end
  ai.test.js          the AI only returns legal actions, takes wins, and full AI-vs-AI games
  server.test.js      accounts, wallet, Facebook verification, matchmaking, legality, payouts, timeouts, reconnects, competitions
  competitions.test.js  ladder, skill draw, Elo, payouts and skill-limited AI
  spin.test.js        lucky-wheel cooldown, rescue rule, weighting and device spins
  helpers.js          deterministic RNG for the tests
```

### Rules engine

`gameLogic.js` is pure and immutable: `playMove(state, bin)` and `chooseExtra(state, bin)` return a new state, a list of **events** and a move **record**. Illegal actions throw `IllegalMoveError` with a reason code; `validateMove` reports the same codes without throwing.

- The renderer animates the events: `pickup`, `sow`, `capture`, `chooseExtra`, `turnEnd` and `gameOver`.
- The move history is built from the records.
- Each player's 2N bins are indexed along that player's own anti-clockwise loop, so sowing is simply `(bin + 1) % 2N`.
- `columnOf` and `binAt` map bins to board columns.

### AI

Minimax with alpha-beta pruning, iterative deepening and a time budget. It runs in a Web Worker.

- **Easy:** depth 1, with some random moves.
- **Medium:** depth 3.
- **Hard:** searches up to depth 12 within about 1.8 s.

Choosing the extra capture bin is treated as its own decision node. Positions are scored on material, mobility and inner-row occupancy.

## Testing

`npm test` runs 80 unit tests: initial setup, sowing direction and relay, capture conditions, the extra-bin choice, both phase restrictions, illegal-move rejection, turn order, game-end detection, a clean restart, and AI legality across many seeded games.

The full game was also smoke-tested in headless Microsoft Edge with no console errors. That run covered mouse clicks, illegal clicks, undo, history, pause and restart, vs-AI play including the extra-bin choice, a practice hint, the tutorial, a complete game to the end screen, and touch taps on a mobile viewport.

## Mobile layout

Every screen is checked on an iPhone 11 viewport (414 × 896, and 414 × 715 with the browser bars) in portrait and landscape (896 × 360). The lobbies keep secondary actions (leaderboard, rename, sign in, Facebook, sign out) in a **⋯** menu on phones, switch to two columns in landscape, Settings is split into tabs, and long pages (Rules, About) scroll with the Back button always visible.

## Settings

Language; scenery; sound, background music and volume; graphics quality (pixel ratio and shadows); seed counts; move hints; animation speed; the camera following the current player; board size; and the optional move limit. Settings are saved in `localStorage`.
