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

Remaining differences must be described accurately in `PARITY.md`; a passing test suite is not evidence of pixel-perfect or exhaustive equivalence.

## Execution record — version 2

- Implemented the expanded cooking/management engine, catalog, optional mini-games, payment incidents and separate local competition.
- Replaced runtime recipe placeholders with original ingredient SVGs; added storefront colors and decoration art.
- Completed independent code, financial, persistence, browser and visual reviews; repaired the findings and added regression checks.
- Passed 39 engine/side-game tests, 18 browser scenarios and the seeded 100-day simulation; built the static distribution.
- Delivery preserves the previous app under `.review-backup/parity-v2-*`, installs source/assets/build/docs/tests, and compares file hashes. Current test evidence is retained in `test-results/parity-v2/`.
