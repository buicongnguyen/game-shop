# Local implementation audit

Audit date: 2026-09-30. Scope: the independently authored second implementation in this directory. Earlier v1 test totals and old screenshots are not evidence for this revision.

## Reference review

The public reference HTML and delivered script were inspected read-only. Factual values, observable rules and source anchors are summarized in [reference-values.md](reference-values.md), with implementation coverage and gaps in [PARITY.md](PARITY.md). No interactive remote playthrough was performed for this audit. Public-source inspection establishes intended branches, not that every branch is reachable or works on the live server.

## Engine review

Independent read-only review covered state transitions, FIFO stock, quality timing, wrong dishes, grouped customers, staffing, closing, accounting, loans, save validation and previous-version migration.

Concrete defects identified and corrected during this review included:

- Chef ownership incorrectly exempted a manually started pot from burning when the ready basket was full, allowing an elapsed value that the save loader rejected.
- Group service needed selected-customer priority, matching any unfinished group dish, retained bad-noodle penalties, and tips/reviews/combo at group completion.
- Stockout checks needed to include ingredients already in the current bowl, cooked basket or pot.
- Migration from the first local implementation needed to pass through the same canonical validator, including duplicate customer IDs. This does not import saves from the original website.
- Loan repayment needed to separate interest expense from principal rather than treating all debt payment alike.
- Loan borrowing/repayment needed atomic numeric-limit checks, and imported active timers needed consistent elapsed/remaining bounds to avoid a valid import becoming unloadable after the next action.

Boundary probes also exercised accepted imports at numeric limits. Normal purchases, active cooking, market discounts, burned pots and mini-game progress were checked for save/reload compatibility. These checks are regression evidence, not a security certification.

## Automated checks

Commands for this revision:

```text
node --test tests/game.test.js tests/sidequests.test.js
node tests/simulation.mjs
npm run test:browser
npm run build
```

The side-game suite has 11 passing scenarios covering green/yellow/missed market rounds, once-per-day discounts, recipe determinism and attempts, failed/abandoned recipes, partial/full/timed-out washing, one-time bowl recovery, malformed side-game imports, and a complete engine save/reload spanning all three mini-games. It includes a public-action three-customer service/closing setup rather than only mutating a mocked result.

The engine suite exercises stock/cooking/order rules, grouped customers, closing and expiry, staff, goals, loans, live saves, prior local-version migration and payment choices. Delivery capacity and reviewer/student visitors have separate engine branches. A seeded 100-day simulation was also run through real public actions and cooking timers while unlocking content progressively. Counts and browser/build results should be taken from the current test output; final integration checks are recorded by the maintainer below.

## Mini-game/UI integration review

The market, recipe and washing interfaces were reviewed against the side-game API. They pause the shop through the shared modal, suspend mini-game time in hidden tabs, save progress and finalize/abandon a round safely on close. Washing credits recovered bowls once as a free FIFO batch; it does not reimburse ingredient cash or add duplicate expenses. The weekly recipe and scrubbing algorithm are independent implementations.

## Final integration evidence

- `npm test`: **39/39 passed**, including ingredient rules, grouped orders, independent delivery slots/timers, payment decisions, fractional closing boundaries, loan accounting, migration and daily mini-games.
- `npm run test:browser`: **18/18 scenarios passed**, with no runtime exceptions, missing assets or external requests. This includes real customer arrival and cooked-bowl service, keyboard focus, save/import/export, hidden-tab pause, payment-dialog reload, daily challenge isolation, mini-games and five viewport sizes.
- `npm run test:simulation`: **100 seeded days**, **36,962 checks**, **13,011 served bowls**, and **9,532 customers**. The simulation exercised all 32 ingredients and all 6 staff roles while reconciling cash, FIFO batches, timer bounds and save/load state.
- `npm run build`: static build completed. Runtime code and all artwork/fonts load from the local server.
- Independent visual inspection found and repaired inherited CSS that hid the cooking gauge's 50/28/22 regions and stretched the spice badge. Browser assertions now check both geometries. Keyboard focus restoration also now preserves the exact price-step button.

The browser runner writes screenshots and JSON results into `test-results/`. Delivery copies the current evidence into the requested folder's `test-results/parity-v2/` and verifies delivered file hashes against the tested staging files.

## Limits

Automated local checks do not establish exact visual parity, original server behavior, balanced long-term economics under every player strategy, or exhaustive mobile/accessibility coverage. The remaining product differences are explicitly listed in [PARITY.md](PARITY.md). JSON saves remain player-controlled data; validation prevents malformed state from entering normal play, and does not function as an anti-cheat service.
