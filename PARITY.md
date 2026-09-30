# Reference parity — independent local recreation

Reference inspected: [aenhatrang.com](https://aenhatrang.com/), public HTML and its delivered browser script on 2026-09-30. This is a source-informed comparison, not a claim of exact runtime, artwork, or online parity. The original executable code and extracted original image data are not included in this app. The local code and SVG artwork were authored independently.

Detailed observed rules and source function anchors are recorded in [reference-values.md](reference-values.md). That document describes the reference; it does not assert that every rule is implemented locally.

## What is implemented

| Area | Local behavior | Remaining difference |
| --- | --- | --- |
| Opening | Vietnamese shop naming, 400,000 starting cash, empty inventory, editable 0–99 purchasing cart, five initial unlocked ingredients | Original scripted first-customer tutorial is replaced by illustrated instructions and cooking hints |
| Ingredient catalog | 32 entries: two bases, nine broths, 21 toppings; separate purchase and component selling prices, unlock fees and level gates | Stock purchase recommendations use a local planning heuristic |
| Stock and expiry | Immediate consumption when taking a bowl, starting noodles, adding broth or topping; costed FIFO batches; perishable expiry at closing | The local ledger records ingredient loss without reproducing every original accounting category |
| Bowl assembly | Irreversible additions, up to four distinct toppings, chili increments to seven, explicit discard | Local animations, icons and kitchen arrangement differ |
| Noodles | 5.2-second pot, 4.2 with stove; raw below 50%, ideal through 78%, soft thereafter, automatic loss at full duration; multiple pots and chef basket | The original animated scoop is represented by a direct collection interaction |
| Serving | Selected customer priority, fallback to any matching waiting customer and unfinished group dish; wrong dishes discard stock and reduce patience | Review text and customer personalities are a smaller independently written set |
| Stockouts | Stock checks include the bowl and cooking equipment; rush purchasing, waiting, substitution/removal and cancellation are supported by the engine | The local substitution outcome is deterministic rather than the original acceptance/refusal chance |
| Customer progression | Level-based topping/spice distributions, later groups, patience scaling, group-completion reviews/tips/combo | No exact recent-ingredient repeat suppression or full personality-specific behavior |
| Delivery | Separate two-slot app queue and arrival clock, single-bowl orders, 20% fee, longer patience and last-ten-second cutoff; rain increases delivery frequency | First-arrival timing and random sequences differ; far-delivery riding is not implemented |
| Daily events | Weekend/weekday events, weather effects, sale ingredient, payday tips, scheduled students and reviewer; reviewer ratings count three times and star XP twice | Weekday selection is deterministic and does not use the original weighted event pool |
| Day and closing | 210-second arrival period, late arrival cutoff, up to 60 seconds to clear orders; full rent, utilities and wages | Manual early closing is an explicit local two-step close/grace flow |
| Economy | Component prices, expensive-price effects, FIFO cost of waste, negative cash, two loans with 10% interest and six-night installment calculation | The reference bankruptcy narrative, restock reserve restrictions and full financial ledger are simplified |
| Progression | Ten XP levels, 20 equipment/accessory entries, six staff, 13 decoration choices; three daily goals selected from eligible types | Goals and weekday events use local deterministic selection; goal rewards may be claimed manually and auto-claim at closing |
| Staffing | Cashier, automatic noodle chef, waiter patience benefit, restocking buyer, broth and topping helpers; daily wages | Dispatch details and some staff-related incident effects are simplified |
| Payment incidents | Paused choices for dine-and-dash, excess/short payment, customer credit and complaints; cashier prevention, daily limits, review/economic effects and receivables | Text is independently written; debt collection is consolidated into closing rather than a separate next-morning scene; customer bargaining and street stories remain absent |
| Market bargaining | Three timing rounds, 5% green/2% yellow awards, up to 15% discount for that game day; normal/rush prices use the discount | Gauge art and presentation are independent |
| Secret broth | Day-three availability, weekly recipe, four steps at low levels, five at levels 4–6, six from level 7; two attempts per day, +1 rating and 2,000 per matching dine-in bowl | Recipe permutation is independently seeded and does not reproduce the original sequence; preview controls differ |
| Washing | Optional 15-second game after an eligible closing, up to ten represented bowls, proportional recovery, one claim per day | Uses deliberate scrub-input progress rather than pixel-level dirt coverage |
| Decoration | Five awnings, plants, lamps and pets; selected choices appear at the shop | One selected plant and one selected lamp instead of independent placement/hiding of all owned decorations |
| Reviews and records | Star filters, local owner replies, finances, personal records and a daily seeded competition isolated from the main shop | No AI-generated reply consequences or real-player rankings |
| Saving | Local auto-save, validated JSON import/export, active bowl/pot/customer state, preferences, prior local-version migration with backup | Saves are local to this browser; no original-service save compatibility, transfer codes or cloud sync |
| Pause and access | Dialog pause, hidden-tab pause/resume, keyboard controls, responsive layout, sound/motion settings and dark theme | Exact screen-reader behavior and animation timing of the reference are not reproduced |

## Remaining reference features

Some local mechanics deliberately approximate the reference. Individual price-based refusal, ingredient repeat suppression, buyer dispatch, full customer personalities and story events need to be judged separately from the implemented cooking loop. The buyer uses a selected-order queue rather than independently scheduling each just-depleted ingredient. The reference also contains far-delivery riding, street incidents, gifts, staffing absences and other narrative branches beyond the local mini-games and payment choices.

Online leaderboards, shared daily competitions, neighboring-shop interactions, account transfers and server-backed AI are not connected to the original service. The local personal record/competition display explicitly identifies its scope. It does not fabricate online users or rankings.

Artwork, typography, sounds and micro-animation are an original visual interpretation of a warm Vietnamese street shop. No Blender or Unity dependency is required for this browser-based 2D implementation.

## Verification scope

Current local verification is documented in [AUDIT.md](AUDIT.md). Source observations, automated engine tests and local browser checks are different evidence types; none establishes an exact match to every reachable reference state.
