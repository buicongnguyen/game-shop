# Local implementation audit

Audit date: 2026-09-30. Scope: the independently authored second implementation in this directory. Earlier v1 test totals and old screenshots are not evidence for this revision.

## Reference review

The public reference HTML and delivered script were inspected read-only. Factual values, observable rules and source anchors are summarized in [reference-values.md](reference-values.md), with implementation coverage and gaps in [docs/PARITY.md](docs/PARITY.md). No interactive remote playthrough was performed for this audit. Public-source inspection establishes intended branches, not that every branch is reachable or works on the live server.

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

## Reference edge cases and how they resolve — 2026-10-01 (third pass)

**Method.** The delivered reference script was read again, focusing on situations and their outcomes: payment incidents, haggling, street stories, stockouts, timeouts, insolvency, the buyer, the chef, the tutorial, the morning cards and review replies. Each rule was written down as behaviour only. It was then reimplemented with original code and text.

**Gaps found and closed.**
- **Tutorial:** no first-run tutorial. Added a scripted first guest, a clock that waits, a step-by-step coach and Skip. Closing during the tutorial now hands over to a normal day.
- **Street stories:** none existed. Added 15 original stories on day windows, sharing the daily cap. They wait while a bowl is in hand and roll their outcomes when they open. The effects include the dirty floor and the inspection, a noisy guest and tourists.
- **Customer traits:** added the hurried, fickle and haggling traits, plus personas and spoken order lines.
- **Stockouts:** handling was a fixed swap or cancel. It is now chance-based: guests switch or walk away on arrival, and the ticket's Handle choices cover rush, swap, drop, wait for the buyer and send away.
- **Walkout reviews:** walkouts always left 2★. Now it's 1★ (70%) or 2★, a late app order leaves 1★, and guests still waiting at closing leave no review.
- **Buyer and chef:** the buyer worked from the selected order's queue. It now leaves per item at depletion: 12 s, four trips, never while closing. The chef now harvests only her own pots.
- **Insolvency:** negative cash could soft-lock a save with no explanation. Opening is now blocked with a reason, and the way out is a loan or a fresh shop. Purchases keep an opening reserve.
- **Debts:** debt collection was silent. It now arrives as morning cards, alongside windfalls and the level-up card.
- **Replies:** owner replies had no effect. They now follow the tone rules: a two-day window, two messages, a star cap and a one-time XP bonus. Reviews store their cause and first rating.
- **Goals:** goals are paid when met, and there are level-up toasts.
- **Feedback:** added a 20 s closing warning, toasts that stack, a shake on refused taps and floating earnings.
- **Sound:** a synthesised sound engine replaces the single beep.

**Hardening found while testing.**
- A tampered save naming a story such as `constructor` could reach an inherited object property. Story lookups now use own keys only.
- Saved choice lists are rebuilt from the situation instead of being trusted.

**Evidence.**
- `npm test`: **88/88**, adding `situations.test.js` (25 regressions), `audio.test.js` and `voice.test.js`.
- `npm run test:simulation`: 100 days, 37,506 checks. Every story type and the inspection were exercised, with a full save round-trip after every action.
- Browser suites: 18/18, 26/26 and 19/19 locally. The same three suites passed again against the built `/game-shop/` site.
- Updated browser scenarios play through the tutorial, confirm the one-second lock on situation choices, and open a real stockout on 320–844px phones.
- Screenshots at 390×844, 360×740 and 1440×900 were reviewed for the coach, story and stockout dialogs, the ticket alert, the puddle, the summary, morning cards, reviews, the reply dialog and the empty-till note. Two overlaps they revealed were fixed: the puddle over a guest's name, and the slow-stove note being hidden on phones.

## Customer conditions and a bug hunt — 2026-10-01 (fourth pass)

**Customer rules added from the reference script** (rules and thresholds only):
- **Price refusals:** severe prices turn away 80% of passers-by, and 1 in 10 of those leaves a review. An expensive dish is refused 40% of the time. Students, the reviewer and tourists bypass both checks.
- **Prices tab:** each item now shows its cost and a tag.
- **Repeat avoidance:** guests weight away from the last six orders' ingredients.

**Independent review:** a separate reviewer fuzzed about 270,000 random calls across the engine API. It checked the cash identity, stock batches, lifetime totals, reference integrity, exact save round-trips, that every situation has a working choice, and that every day can finish. Nothing failed and nothing threw. It did confirm seven smaller bugs, all fixed with regression tests:
- **Reviewer patience:** the reviewer could keep a hurried guest's shortened patience.
- **Level-up cards:** gaining two levels in one day showed only the last level-up card.
- **Inspection:** the hygiene inspection used up a daily situation slot.
- **Event preview:** the previewed event could change before opening. It is now fixed at closing, saved and validated.
- **Story guests:** stories promising guests reported them even with every table full.
- **Save validation:** hand-edited saves could carry a gift note with no variant, a swap of the wrong ingredient kind, or a noisy guest who isn't seated. They are now refused.
- **Tutorial:** the test-only story trigger was not blocked during the tutorial.

Two plausible issues were also changed:
- A reviewer sent away over a sold-out dish now writes all three reviews.
- Reply XP now depends on the review's current stars.

**Test note:** the 100-day simulation's revenue check now counts income booked for the morning after its last day.

## Detail, the delivery ride and the starship — 2026-10-01 (fifth pass)

**Evaluation of the request.**
- **Detailed drawings:** the reference gives every object its own illustration (86 embedded pictures: per-broth pots, an idle or boiling noodle pot, toppings, customer and staff portraits, mascot moods, pets, mini-game sprites). Its scenes are composed from them. That mechanism was copied, and every picture was drawn from scratch.
- **Starship to other planets:** this does not exist in the reference. It was built as an optional late-game extension of the reference's far-delivery scooter ride (which was missing here), sharing one engine.

**Work.**
- **Original art generators:**
  - characters with moods;
  - redrawn ingredient icons;
  - per-broth pots, a noodle pot with a flame, and the bowl drawn from its contents;
  - a shop scene layered from decorations and upgrades;
  - a time-of-day street and a doodle background;
  - the two canvas mini-games.
- **Reference rules for far deliveries:**
  - at most 2 a day, 20% of app orders (30% in rain), ×1.25 patience;
  - ride, or hire a courier for 15,000₫;
  - three lanes over 4,500 units; a hit means 0.9 s invulnerability and 0.8 s slow;
  - bonus 20k/10k/0 and stars +1/0/−1.
- **Starship rules:**
  - five planets with their own hazards, fuel loads and canisters;
  - emergency thrusters when the tank runs dry;
  - tiers that pay a bonus and move stars.
- **Side-by-side check against the reference** at 430×932 and 1366×768. It led to four changes:
  - the prep layout now matches (large shop picture on the left; bargaining with the vendor and today's goals at the top of the stock tab);
  - locked items show greyed with a padlock;
  - a tutorial spotlight with the tip card beside the target;
  - a chili-sauce bottle.

**Bug found and fixed while testing:** the planet-order scheduling had been inserted between an `if` and its `else if`, which would have switched off street stories for spaceport owners. A regression test now covers it.

**Performance** (the `lightweight-game-objects` measuring method). This is the service screen at 390×844, DPR 2, with the CPU slowed 4×, timed by a browser trace, in milliseconds of work per second (median of 3 interleaved runs):

| Work | Previous build | After the first integration | Final |
| --- | --- | --- | --- |
| Paint | 15.5 | 27.4 | 14.7 |
| Raster | 105 | 51.3 | 72.1 |
| Style and layout | 18.6 | 37.7 | 17.9 |
| Script | 11.4 | 12.3 | 10.8 |

The middle column was measured in an earlier trace session, whose previous-build baseline came out at 17.8 / 39.7 / 24.1 / 11.5. The other two columns come from the same session.

What fixed it:
- the street drawing is static, on its own compositor layer;
- rain is a GPU-moved overlay;
- static pictures (faces, the street, the ticket bowl) are drawn as cached images instead of thousands of inline SVG nodes;
- CSS containment.

**Evidence.**
- `npm test`: **154/154**, including:
  - `delivery.test.js`;
  - `ride.test.js`;
  - `art-people.test.js`, `art-bowl.test.js` and `art-scene.test.js`.
- 100-day simulation: 178 rides and 51 flights settled, with every cash, stock and save-round-trip invariant passing.
- Browser:
  - the parity suite passes **20/20**, including a ride to the finish and a flight from fuel choice to docking;
  - interaction 26/26;
  - layout 19/19.

## Living details and the missing reference features — 2026-10-01 (sixth pass)

**Evaluation of the request.**
- **Small living details:** the reference feels alive through many small motions, timed precisely. Examples:
  - guests walk in (30 px, 0.45 s) and bob (3 px, 2.4 s);
  - hearts on a perfect bowl;
  - a strainer scoop with a splash in the broth colour;
  - the bowl flying to the guest;
  - the wallet counting up;
  - a 1.2 s choice lock.

  These were copied by their numbers into a pooled effects layer. The reference's street is a flat panel; the living street is our addition.
- **Missing features:** each was built from the reference's rules:
  - the staff love story, with absences and pay cuts;
  - neighbour pranks;
  - the what's-new card;
  - the terms gate;
  - home-screen install.

  The pranks use six fictional neighbours, because the reference's real players need its server.
- **Originality:** the staff carried the reference's names, so they were renamed (Chị Quế, Bé Ngò, Bé Nghệ, Cô Hồi, Anh Sả, Bé Tía Tô). The mascot got its own name, Ớt Hiểm.

**Work.** Six parallel builders had strict file ownership; the interface was integrated in `src/app.js`.
- **`src/fx.js` and `src/fx.css`:**
  - arcs, scoops, pours, drops, bursts, departure ghosts, counters and captions;
  - every animation is transform and opacity on one fixed layer, and pauses behind dialogs and hidden tabs.
- **`src/audio.js`:** 23 new synthesised cues.
- **`src/life.js` and `src/art/life.js`:**
  - 33 sprite kinds, 16 street scenes, and seeded ambient plans;
  - at most 3 actors on phones and 6 on wide screens.
- **Engine:** `src/neighbours.js` is new, and `game.js`, `situations.js`, `voice.js` and `catalog.js` gained:
  - the love story and absence-aware wages and automation;
  - the prank queue;
  - validated save fields;
  - structured notices and barks.
- **`src/meta-ui.js`:** terms, what's new, install help and tips.
- **`src/pwa.js`, `sw.js`, `manifest.webmanifest`:** install and offline play, with updates applied on the prep screen.

**Bugs found while integrating.**
- **`replaceContents` never matched:** it compared `innerHTML` with the source string, which never match once SVG is serialised. The bowl was re-inserted on every paint, costing layout and paint and replaying its animation. It now remembers what it wrote.
- **Patience bar width transition:** it restarted every 150 ms. It is now a compositor-only `scaleX`.
- **Box-shadow pulses** on urgent guests, the tea button, danger pots and the closing clock repainted every frame. They are replaced by transform/opacity versions.
- **Zero-size anchors:** hidden nodes report an all-zero rectangle, which counted as a valid anchor, so effects aimed at nothing on 320 px phones with three pots. A zero-size rectangle now counts as absent.
- **Pet button:** with animations off, a `translate()` on the pet button let Chrome deliver real taps to the picture underneath, although `elementFromPoint` found the button. It is now placed without a transform.
- **Dialog pop:** a scale pop made the dialog's close button 41 px tall for 0.2 s. It now slides instead of scaling.
- **`:has()` pause rules:** `body:has(dialog[open])` rules restyled the whole page about nine times a second. The layers now pause from a class set by script.

**Performance.** Service screen at 390×844, DPR 2, CPU slowed 4×, browser trace, milliseconds of work per second, median of 3 interleaved runs. Round 3 (76773c1) and this round were measured in one session, so they compare directly. Absolute numbers depend on machine load, so compare columns, not passes.

| Work | Round 3 | Round 4, motion on (effects and street running) | Round 4, motion off |
| --- | --- | --- | --- |
| Paint | 72.8 | 20.1 | 9.6 |
| Raster | 23.2 | 8.7 | 8.3 |
| Style and layout | 83.9 | 42.3 | 21.2 |
| Script | 51.5 | 59.0 | 45.9 |
| Composite | 14.9 | 6.2 | 1.7 |

**Evidence.**
- `npm test`: **259/259**. New suites:
  - `staff.test.js`, `neighbours.test.js`;
  - `meta.test.js`, `pwa.test.js`;
  - `art-life.test.js`, `fx.test.js`, `life.test.js`.
- **100-day simulation:** 36,823 checks pass. It covered 3 love-story stages (walkout, grant, gift), 150 surprises sent and 169 received, 178 rides and 57 flights.
- **Browser, development server:**
  - parity 26/26, with 6 new scenarios: terms gate, what's new, the love story through leave and the staff card, sending a surprise, the morning gift card, and mascot tips with petting the cat;
  - interaction 26/26;
  - layout 20/20, with effects and street actors on screen at all nine sizes, plus pausing behind dialogs and stopping with motion off;
  - effects 11/11;
  - install and offline 8/8;
  - living street 120/120.
- **Browser, the compiled site under `/game-shop/`:** parity 26/26, interaction 26/26, layout 20/20, effects 11/11, install 7/7.

## Verification limits

Automated local checks do not establish exact visual parity, original server behavior, balanced long-term economics under every player strategy, or exhaustive mobile/accessibility coverage. The remaining product differences are explicitly listed in [docs/PARITY.md](docs/PARITY.md). JSON saves remain player-controlled data; validation prevents malformed state from entering normal play, and does not function as an anti-cheat service.
