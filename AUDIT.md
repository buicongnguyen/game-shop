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

## Mobile interaction follow-up — 2026-09-30

The reported intermittent presses were reproducible: timer paints replaced pot, customer and delivery buttons between press and release. Instant automated clicks and focus restoration had missed this. In the new 16-case baseline, seven cases failed before repair. Interactive nodes now survive animation; only their labels, classes and gauge positions update. Bargaining restores keyboard focus when advancing to a new round.

A press also remembers which pot it began on. If that pot burns or the chef changes its contents before release, the stale press is canceled rather than starting another batch or collecting different noodles. Native mouse drag-away and touch cancellation remain supported; no action fires merely on pointer-down.

The mobile review retained the recognizable shop art, grouped cooking stations, visible stock and large Serve/market buttons. It corrected unreadable timing instructions, small menu/settings/close controls, long ingredient grids and landscape clipping. Touch controls are at least 44px where audited, numeric inputs use 16px text, and critical cooking labels use at least 11px. Swipeable ingredient palettes keep four customers and three pots on single rows. At 390px wide, the advanced game page fell from approximately 2161px to 1414px. A floating cooking panel appears when active pots are outside the visible kitchen, including a scrolled tablet pane.

Real touch gestures exposed a landscape failure that `scrollIntoView()` concealed: before repair, three upward swipes left scrollY at zero and Serve offscreen near y=803; after repair, finger scrolling brought Serve into view. Tests now exercise native swipes, horizontal ingredient drags without accidental additions, floating pot collection, multiple pot widths, and held presses through running timers. Regression reports and screenshots are written under `test-results/` and excluded from Git. Device emulation covers phone portrait, phone landscape and tablet layouts; this is not evidence from physical devices.

Follow-up validation: `npm test` passed **39/39**. After rebuilding, `npm run test:pages` passed **18/18** existing browser scenarios, **26/26** interaction regressions and **9/9** mobile layout checks against the compiled `/game-shop/` artifact. An independent code review also checked press intent, nested scroll clipping and test-runner failure handling.

## Layout, art-fit and logic review — 2026-09-30 (second pass)

**Findings before repair.** Screenshots and geometry probes at nine sizes (320×568 to 1920×1080, including 844×390 and 1024×768 touch) found these problems:
- **Stylesheets:** three stacked stylesheets fought each other. Many rules targeted markup that no longer existed, and some labels were 6–9px.
- **Service screen:** on common laptops (1280×720, 1366×768) the bowl, toppings, chili and Serve sat below the fold inside a nested scrolling pane. On a 1024×768 tablet the service columns were cut off mid-screen. On phones cooking needed about 1,600px of page scrolling, and a floating pot panel covered the order ticket on small screens.
- **Dialogs:** at 1280×720, 1366×768, 1024×768, 360–320px phones and phone landscape, the goals, rush-restock, day-summary, help, settings, menu and mini-game dialogs scrolled as a whole. Their only buttons ended up off-screen, and goal progress bars were unstyled.
- **Art fit:** the bowl image always showed a finished bowl with egg and greens, even when empty. All three plant decorations rendered the same leafy plant, and the dog, hamster and wind chime fell back to operating-system emoji. Decorations were clipped at pane edges, and the help illustrations could render at their natural 600px size.

**Changes.** Visual and layout changes:
- **One stylesheet:** `src/style.css` replaces all three with a single mobile-first design.
- **Service layout:** one column on phones, two in landscape phones and short windows, three on tablets in landscape and PCs. The page never scrolls during service; only the ingredient pantry does, when a screen cannot show every ingredient.
- **Dialogs:** a fixed header, a scrolling body and pinned actions. A dialog that re-renders itself keeps its scroll position and focus.
- **Art:** the bowl and pots are drawn from game state (broth colour, noodle doneness, toppings, chili, pot stage). Five new original decoration SVGs were added.
- **Order ticket:** it ticks off what the current bowl already matches.

Logic fixes from an independent engine review. That review also ran a 1,000-run random-action save fuzzer over 9,721 settled days with no failures.
- The topping helper no longer adds the newly selected customer's toppings to a bowl built for someone else.
- Unlocking an ingredient through emergency restocking during service now adds its kitchen button immediately.
- Closing early now asks for confirmation. Previously a single tap with nobody waiting ended the day and charged full overhead.
- A version-1 save taken mid-day with a waiting customer now migrates. A save this version cannot read is copied to `tiem-mi-cay-local-v1-unreadable` before anything can overwrite it.
- The day summary shows loan principal. Interest is already inside operating costs and was previously counted twice.
- The daily challenge uses separate seeded streams for arrivals and service rolls, so everyone gets the same customers.
- Weekday events can no longer be labelled "weekend", and the spice-challenge event starts at level 3 as in the reference.

Reviewed but deliberately unchanged:
- Loans can be taken at any cash level. Once both loans are used with no cash, the only exit is starting a new shop.
- Progression speed matches the reference XP economy; slowing it is a tuning decision.

**Evidence.**
- `npm test`: **42/42**, including new regressions for the topping helper, event calendar and mid-day v1 migration.
- `npm run test:simulation`: 100 days, 37,069 checks.
- Parity browser suite: 18/18. It now confirms the early-close dialog.
- Interaction suite: 26/26. Its floating-dock scenarios became "pot reachable without scrolling" on a 390×667 phone and a 1024×768 tablet.
- Rewritten layout suite (19 checks), every service size: each cooking control is visible and touchable without scrolling, and touch targets are at least 44px.
- Rewritten layout suite, interaction and dialogs: real finger swipes scroll the pantry without adding ingredients, the last topping is reachable by finger, and every dialog keeps its close and action buttons on screen.
- Built artifact: after `npm run build`, `npm run test:pages` passed all three suites against the compiled `/game-shop/` site (18/18, 26/26, 19/19).
- Stability: the layout suite then passed three consecutive runs.
- Swipe helper: its swipes hold the finger still before lifting. A fling pushing against the end of the list otherwise leaves Chrome using the next tap to stop it, which real phones also do.

## Verification limits

Automated local checks do not establish exact visual parity, original server behavior, balanced long-term economics under every player strategy, or exhaustive mobile/accessibility coverage. The remaining product differences are explicitly listed in [PARITY.md](PARITY.md). JSON saves remain player-controlled data; validation prevents malformed state from entering normal play, and does not function as an anti-cheat service.
