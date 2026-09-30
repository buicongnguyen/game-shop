# Tiệm Mì Cay — local recreation

An independently written recreation of [aenhatrang.com](https://aenhatrang.com/), with a Vietnamese interface, original SVG illustrations, local fonts and responsive desktop/mobile layouts. Version 2 replaces the earlier simplified rules with a much closer cooking and management simulation. See [PARITY.md](PARITY.md) for the remaining differences and [AUDIT.md](AUDIT.md) for verification.

**Play online:** [Tiệm Mì Cay on GitHub Pages](https://buicongnguyen.github.io/game-shop/).

## Run

Requires Node.js 20 or later. No dependency installation is needed to play.

```powershell
cd 'C:\Users\n\source\repos\game\_shop'
npm start
```

Open **http://localhost:4173**. The server accepts connections only from this computer. Press Ctrl+C to stop it. For another port, set `$env:PORT=4174` before `npm start`.

Use the HTTP server, rather than opening `index.html` as a file. `npm run build` creates a static website in `dist/`. Relative asset paths support both a site root and a project subdirectory such as `/game-shop/`.

## Gameplay

- Start with 400,000₫, a 4.0 reputation and empty shelves. Plan a cart with quantities 0–99, or use the suggested order. Confirm purchases and open the shop.
- The catalog contains 32 ingredients, 20 equipment/accessory upgrades, 6 staff members, 13 decorations and 10 progression levels. Ingredients have individual purchase/sale prices, unlock costs and expiry dates.
- Read each customer's broth, toppings and spice request. Taking a bowl, starting noodles and adding ingredients immediately consumes stock. Already-added ingredients cannot be removed or refunded.
- Noodles cook for 5.2 seconds, or 4.2 with the stove. Collect between 50% and 78% for ideal doneness. Raw/soft noodles can be served at a rating penalty; unattended noodles burn. Extra pots and staff enable parallel cooking.
- The service screen always fits the display. Phones use one column, phones on their side two columns, and PCs and tablets in landscape three columns: customers and order, cooking station, pantry. Customers, the order ticket, pots, chili, discard, Serve and the day tools are never scrolled away; only the ingredient pantry scrolls when a small screen cannot show every ingredient at once. The order ticket ticks off the broth, toppings and spice level that the bowl already matches.
- Each chili tap adds one level, up to 7. A finished bowl matches any suitable waiting order, including another unfinished dish in a group. A true mismatch wastes the bowl and upsets the selected customer.
- Customers arrive over a 210-second day. New arrivals stop near closing, then existing orders have up to 60 additional seconds. Closing early asks for confirmation, and closing again during the grace period ends immediately. Prices, reputation, events and equipment influence trade.
- Stock expires by batch. End-of-day accounts include full rent, utilities, equipment electricity and staff wages; cash can become negative. Loan repayments separate principal and interest. Three daily goals award cash and XP.
- Review filters and replies, equipment, staff hiring/dismissal, visible decorations, emergency restocking and stockout remedies are available from management and service screens.
- Optional market bargaining, secret-broth memory play and bowl washing add daily activities. A seeded daily challenge runs separately and keeps the main shop intact. Its records are local to this browser.

The game pauses while dialogs are open and when the tab is hidden. Returning to a hidden active game shows an explicit resume dialog. Stock, the bowl, noodle pots, customers and progression persist together. Old version-1 saves are migrated and their original JSON retained as a backup; the version-1 engine never saved unfinished bowls, so that missing old state cannot be recovered.

Use **Menu → Xuất bản lưu** to download a JSON backup, or **Nhập bản lưu** to restore one. Saves belong to a browser and origin, including the port. Export before clearing browser data or changing ports. If browser storage is unavailable, export is the way to retain the current session.

## Verification

```powershell
npm test
npm ci
npx playwright install chromium
npm run test:browser
npm run build
npm run test:pages
npm run test:simulation
```

The browser runner starts and closes its own local test server. Tests cover engine invariants, reference-based mechanics, side games, actual cooking controls, save/import/export, pauses, keyboard focus, local competition, art loading and responsive layouts. A seeded 100-day simulation checks cash flow, inventory batches and live-save round trips. Screenshots and machine-readable reports are written to `test-results/`. Historical version-1 tests are retained in `tests/archive-v1/` and are excluded from the current commands.

`npm run test:pages` serves only the compiled `dist/` directory beneath `/game-shop/` and runs the full browser suite there. Requests that accidentally target the host root fail this check.

Both browser commands include held mouse/touch/keyboard presses while timers advance, canceled gestures, pot expiry and chef transitions. Layout checks cover phones (320×568 to 390×844), a phone on its side (844×390), tablets (768×1024, 1024×768) and PCs (1280×720 to 1920×1080): every cooking control must be visible and touchable without scrolling, touch targets stay at least 44px, real finger swipes scroll the pantry without adding ingredients, and every dialog keeps its close and action buttons on screen. The tests use browser device emulation; physical iOS/Android hardware was not tested.

## GitHub Pages deployment

The repository uses the SSH remote `git@github.com:buicongnguyen/game-shop.git`. Pushing `main` runs `.github/workflows/pages.yml`: install dependencies, run engine tests, build, verify the compiled project path in Chromium, and deploy the `dist/` artifact to GitHub Pages. The workflow can also be started manually from Actions. Local backups, dependencies, build output and test results are excluded from Git.

GitHub Pages and localhost have separate browser storage. Export a save from the local game and import it on the live site to transfer progress.

## Scope and files

This project has its own code and artwork. It does not use the reference game's source, assets, account system or backend at runtime. It runs locally with no external requests. Online leaderboards, cloud accounts and real-player competition are not connected; remaining offline approximations are listed in [PARITY.md](PARITY.md). Blender and Unity are unnecessary for this 2D browser interface: editable SVGs stay sharp on every screen, weigh about 1 KB per ingredient and take the chosen awning colour. The bowl and cooking pots are drawn from game state, so the bowl shows its real broth, noodles, toppings and chili.

- `src/game.js`: state, cooking, customers, economy, persistence and validation.
- `src/catalog.js`: factual ingredient/equipment/staff/decoration configuration.
- `src/sidequests.js`: optional daily mini-game state and rules.
- `src/app.js`, `src/minigames-ui.js`, `src/ui.js`: interface and controls.
- `src/style.css`: layout, appearance and responsive behavior for phones, tablets and PCs in one stylesheet.
- `public/assets/`: original illustrations, local fonts and font licenses.
- `server.mjs`, `tools/`: local server, build and verification runner.
- `reference-values.md`: observed rules used for the independent implementation.
- `PLAN.md`, `PARITY.md`, `AUDIT.md`: execution plan, comparison and findings.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for reference and font attribution.
