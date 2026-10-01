# Reference parity implementation

Reference: https://aenhatrang.com/, reviewed September 30, 2026.
Destination: `C:\Users\n\source\repos\game\_shop`.

## Plan

1. Re-analyze the reference's publicly delivered behavior. Compare exact stock, cooking, customer, economy, progression and management rules with the simplified local version.
2. Replace the fixed-recipe engine with ingredient-based bowls, immediate consumption, FIFO expiry, irreversible mistakes, parallel pots, all-customer matching, groups, delivery, patience, ratings, closing grace and full operating costs.
3. Add the catalog and progression: 32 ingredients, 20 upgrades, 6 staff, 13 decorations, 10 levels, component pricing, loans and three daily goals. Connect all controls to the same engine state.
4. Add reference-like optional daily activities, payment incidents and a clearly local competition. Preserve old saves through migration, export/import and a backup.
5. Independently review code and formulas. Test actual browser flows, visual controls, keyboard use, screen sizes, save recovery and long-running financial/inventory invariants. Repair findings and rerun affected checks.
6. Build the static app, back up the previously delivered files, update the requested directory, restart the local preview and verify the delivered files.

## Technical approach

Vanilla JavaScript modules, HTML/CSS and original SVG artwork fit the reference's 2D interface. The app remains a dependency-free local web game at runtime; Playwright is a development-only test dependency. No original-site backend calls or player data are used.

The earlier version-1 implementation and audit exposed large mechanical gaps. Version 2 executes the replacement plan above. Historical tests are kept separately because their simplified rules are no longer the acceptance criteria.

## Acceptance criteria

- A fresh shop begins with reference starting cash, reputation and empty inventory.
- Real UI interactions exercise cart purchases, ingredient consumption, timed pots, exact dish matching, errors, service, closing and expenses.
- Ingredient batches and money reconcile through purchases, waste, expiry, wages, loans, rewards and incidents.
- Upgrades, staff, menu prices, decoration choices and daily activities produce visible or measurable effects.
- Saving and reloading preserves the live bowl, pots, customers and pending decisions; malformed imports are rejected.
- The main shop remains intact throughout a separate daily challenge.
- All controls are reachable on mobile portrait, landscape, short desktop and large desktop layouts. The cooking gauge visibly exposes the correct target region; keyboard focus survives updates.
- Runtime assets are local. The delivered source and build match the tested staging files.

Remaining differences must be described accurately in `docs/PARITY.md`; a passing test suite is not evidence of pixel-perfect or exhaustive equivalence.

## Execution record — version 2

- Implemented the expanded cooking/management engine, catalog, optional mini-games, payment incidents and separate local competition.
- Replaced runtime recipe placeholders with original ingredient SVGs; added storefront colors and decoration art.
- Completed independent code, financial, persistence, browser and visual reviews; repaired the findings and added regression checks.
- Passed 39 engine/side-game tests, 18 browser scenarios and the seeded 100-day simulation; built the static distribution.
- Delivery preserves the previous app under `.review-backup/parity-v2-*`, installs source/assets/build/docs/tests, and compares file hashes. Current test evidence is retained in `test-results/parity-v2/`.

## Round 3 — detail, the delivery ride and the starship (2026-10-01)

**Evaluation.**
- **Detail:** the reference gives every game object its own illustration (86 pictures) and builds scenes from them:
  - per-broth pots, a noodle pot drawn idle or boiling, the bowl stack and the chili bottle;
  - every topping;
  - customer and staff portraits, and mascot moods;
  - pets placed in the shop;
  - a doodle page background;
  - sprites for the mini-games.

  Our art was a set of small, simple icons. We take the mechanism (one picture per object, scenes composed from state) and draw everything ourselves, following [docs/ART-STYLE.md](docs/ART-STYLE.md).
- **Starship:** the reference has no starship or planets. It fits best as a late-game extension of the reference's far-delivery scooter ride, which is still missing here. So the ride comes first, then the starship on the same engine: an optional spaceport upgrade, fuel bought before launch and collected on the way, planets with their own hazards, and obstacles to dodge.

**Steps.**
1. Style guide and art generators in `src/art/` (characters, bowl, scene) plus redrawn ingredient icons.
2. **Characters:**
   - customer portraits by persona with happy, waiting and angry moods;
   - staff portraits;
   - a mascot with moods.
3. **Kitchen:**
   - a pot per broth, and a noodle pot that shows boiling;
   - toppings drawn inside the bowl, and steam;
   - all 32 ingredient icons redrawn with more detail.
4. **Shop and street:**
   - a shop scene that shows the awning, decorations and every purchased upgrade;
   - a service street whose sky follows the day, with rain on rainy days;
   - a doodle page background;
   - coins flying to the till, and stamps.
5. **Far-delivery ride**, following the reference's rules:
   - at most 2 far app orders a day;
   - ride yourself or hire a courier for 15,000₫;
   - a three-lane road with potholes, puddles and cones;
   - a bonus by hits and a star change.
6. **Starship, interplanetary delivery:**
   - unlocked by a spaceport upgrade at level 9;
   - five planets;
   - fuel load before launch, a fuel gauge that drains, fuel canisters to collect;
   - asteroids, debris and comets.
7. Engine tests, simulation, browser and layout suites, screenshots on phone and PC, documentation.

**Acceptance.**
- Every object on the service and prep screens has its own original illustration.
- The shop scene changes with each decoration and upgrade.
- Both mini-games are playable by touch and keyboard, pause the shop, survive a reload (the choice dialog reopens), and settle money and stars exactly once.
- All suites pass, and the fit-the-screen layout contract holds from 320×568 to 1920×1080.
