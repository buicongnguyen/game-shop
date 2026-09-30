# Reference mechanics and catalog provenance

Checked on 2026-09-30 against the public script delivered by https://aenhatrang.com/ at `/g/92d5765e369528a833e1.js`. Temporary observations were read from `shop-audit-work/reference-script.txt` and its image-stripped analysis copy. The catalog and this explanation are independently authored; the original script and artwork are not project assets.

The source function names below are evidence anchors for this version only. They are not stable public APIs. These findings describe normal shop mode; competition mode deliberately bypasses stock and uses its own points.

## Configuration contract

`src/catalog.js` exports the requested arrays and constants. Additional fields are factual conveniences for the implementation:

- Ingredients: `unlockPrice`, `shortName`, optional broth `color`. `kind` is `broth`, `topping`, or `base`; purchase `price` is for one portion; `sellPrice` is a component of a bowl's price. Base items have sellPrice zero. Null expiry means indefinite shelf life.
- Upgrades: `utilities` is the additional daily cost, either 6,000 or zero. Optional `requires`, `trafficBonus`, `patienceMultiplier`, `cookDuration`, `capacity`, `pots`, `fee`, `tipMultiplier`, `priceTolerance`, `eveningTrafficBonus` describe their effects. Each is purchased once.
- Staff: `price` is the hiring fee and is zero; `wage` is paid each day the employee is active. The source's `from` attributes are historical; actual level gates come from its active unlock mapping, reflected in this catalog.
- Decorations: `value` is an awning color or a semantic asset name. `shadow` supplies the darker awning trim. One awning and one pet are selected; owned plants/lamps may be hidden independently.
- Events: `traffic` is a multiplier and `patience` is one for every event. The sale event's `costMultiplier=.7` applies to one selected ingredient, not the whole stockroom.

Counts: 32 ingredients (9 broths, 21 toppings, 2 bases), 20 upgrades/accessories, 6 staff, 13 decorations, 10 levels, 10 events.

Initial unlocked IDs are exactly `bowls`, `noodles`, `kimchi`, `beef`, `sausage`. Initial owned stock is empty. Cash is 400,000. `greens` is purchasable at level one but must first be unlocked for 30,000. Level eligibility alone does not imply ownership. Reference evidence: `Kn()`, item definitions, and `nh()`.

## Time, stock, and assembly

- Day arrival period: 210 seconds. Stop ordinary customer spawns at 202 seconds and app spawns at 200 seconds. At 210 seconds, stop taking new business and finish waiting customers; closing grace is at most 60 seconds. If the queue empties in overtime, finish shortly afterward. Evidence: `yo()`, `yh()`, `Bo`.
- Default noodle-pot duration: 5.2 seconds; strong stove: 4.2. Quality bands are progress below 0.50 raw, 0.50 through 0.78 ideal, above 0.78 soft. At progress 1, uncollected noodles are thrown out and counted as waste. Temporary disruption can multiply duration by 1.6. Evidence: `Ec()`, `gh()`, `wo()`.
- An idle pot may be started before taking a bowl. A bowl is required to collect a cooked portion. Bowl and pot are separate resources, allowing pre-cooking and multiple pots.
- Consume a bowl on taking it, noodles on dropping into a pot, and a broth/topping portion on adding it. FIFO stock batches are sorted by expiry. Do not consume these ingredients a second time at service.
- Shelf expiry day = purchase day + shelf life - 1. At closing, remove lots whose expiry is at most the current day. Bowls never expire. Evidence: `kt()`, `UA()`, `xc()`.
- A bowl permits one broth and one noodle portion; toppings cannot be removed and have a maximum of four distinct types. Chili starts at zero and increases one level per press, capped at seven. Contents cannot be swapped. Discarding removes the bowl and records ingredient cost as waste; it does not charge cash twice. Evidence: `gh()`, `po()`.
- Raw and soft noodles are sellable if composition is correct. They penalize quality. The source stove description claims a wider ideal zone, but actual collection thresholds remain 0.50–0.78 in inspected code; the catalog describes only the verified speed effect.
- When serving, search the selected customer's unfinished bowls first, then all other customers. Exact match means same broth, spice, and unordered topping set. If no match exists, discard the bowl, increment wrong-order counts, reset combo, and subtract 30% of that customer's maximum patience, with a 0.5-second floor. Missing bowl/broth/noodles is rejected before this penalty. Evidence: `fh()`, `gi()`.

## Purchasing, selling, and cash

Reference stock controls use ±1 portions, numeric input 0–99, and hold-to-repeat; confirmation purchases the combined cart. The stock suggestion rounds to multiples of five. The tutorial text that still describes +5 is stale. Evidence: `Fs()`, `Ka()`, `Ja()`, `Gt()`.

Current unit cost is base purchase cost times a sale multiplier (0.7 only for the day's chosen item) times (1 − negotiated discount), rounded to the nearest 10. Bargaining provides up to 15% total discount. Evidence: `EA()`, `He()`, `js()`.

Selling price is editable per unlocked broth/topping in 1,000 increments, minimum 1,000, maximum three times the suggested component price. A dish earns its broth selling price plus each selected topping's selling price. Bowls/noodles are included in the broth component. Evidence: `Ys()`, `Ja()`, `Qe()`.

The photo-menu accessory sets price tolerance multiplier `T=1.2`; otherwise `T=1`.

- A broth is expensive above 60,000 × T.
- A topping is expensive above suggested component price × 1.5 × T.
- Any component is severely overpriced above suggested component price × 2 × T.
- Severe pricing triggers an 80% pass-by chance for a prospective ordinary customer; if a selected dish is merely expensive, a separate 40% rejection chance applies. Expensive food also affects ratings and the broader traffic formula below. Evidence: `aa()`, `oa()`, `ne()`.

Rush restock supplies five portions at 1.5 times today's unit purchase price, with unit price rounded to the nearest 100 before multiplying by five. It is immediate. Buyer staff instead supplies five at the ordinary current price after 12 simulated seconds, at most four trips daily. Payment is checked on return. Evidence: `Hi`, `_o()`, `ll()`, `rl()`.

Out-of-stock choices also include offering another available broth/topping (75% acceptance), removing the unavailable topping with a lower price, asking the customer to leave, or waiting. The stockout modal pauses the simulation. Evidence: `fl()`.

## Customer generation and patience

Stages depend on level: stage one at levels 1–2, stage two at 3–6, stage three from level 7. Evidence: `an()`, `lo()`, `ne()`.

| Parameter | Stage 1 | Stage 2 | Stage 3 |
|---|---|---|---|
| Topping count | 0/1 with weights .15/.85 | 0/1/2 with weights .15/.50/.35 | 0/1/2/3 with weights .10/.35/.35/.20 |
| Spice | 0–3 with weights .20/.30/.30/.20 | 0–7 with weights .07/.12/.17/.18/.15/.12/.10/.09 | same as stage 2 |
| Group size | 1 | ordinarily 1; weekend 30% chance of 2 | 1/2/3 with weights .50/.32/.18 |

Choose only unlocked ingredients. Selection discourages repeating components from the latest six orders: a component's weight is inversely proportional to `1 + 1.5 × recent appearances`. An unavailable selected ingredient gets a 50% chance to switch to an in-stock candidate; otherwise the visitor leaves as a stockout instead of occupying a table.

Base patience in seconds is `(66 + min(level − 1, 8) × 4)` multiplied by owned fan 1.25, wifi 1.12, padded chair 1.12, television 1.10, and active pet 1.08. Then multiply by `1 + .65 × (bowls in group − 1)` and `1 + .12 × average toppings per bowl`. A hurried customer multiplies this by .6. Evidence: `Fc()`, `Vc()`, `ne()`.

Ordinary patience drains one second per simulated second. Waiter multiplies drain by .85. Dirty floor multiplies drain by 1.15; a noisy other customer by 1.3. Thus waiter is a slower drain, not a fixed duration addition. Evidence: `yo()`.

App order patience is `(96 + min(level − 1,8) × 5) × (1 + .12 × topping count)`. A far delivery multiplies patience by 1.25. App orders occupy their own queue, maximum two. Dine-in capacity is three, or four after the extra-table purchase.

An eligible dine-in customer below 60% patience may be offered tea once: cost 3,000, restore 35% of max patience capped at max. Evidence: `ri()`, `ch()`.

## Traffic

Source-derived ordinary traffic multiplier (`Ve()`) is the product of these factors:

1. Reputation factor: `(.6 + (stars − 1)/4 × .8)`, additionally ×.65 below four stars.
2. Shop factor: `1 + sum(traffic bonuses) + LED bonus + decoration bonus + min(day,30) × .015`. LED adds .25 once elapsed day exceeds 55% of 210 seconds; the prep estimate uses .25 × .45. Each purchased nonfree decoration adds .02 traffic, capped at .20.
3. Opening maturity: `min(1, .65 + day × .1)`.
4. Temporary buzz: clamp `1 + buzz` between .7 and 1.6, additionally ×.75 while dirty.
5. Daily event multiplier from `DAILY_EVENTS`.
6. Divide by the square of the clamped price ratio: average unlocked broth selling-price/suggested-price ratio divided by the photo-menu tolerance; clamp this ratio to .85–1.6.

Ordinary next-spawn gap = `10 / traffic / timeOfDayFactor × random(.75,1.25)` seconds. Time factors for fractions of the 210-second day are: below .08→.8; .08–.28→1.45; .28–.50→.6; .50–.78→1.4; remainder→.8. Evidence: `W.gap`, `Ve()`, `jc()`, `yo()`.

App arrival gap = `22 / traffic × (rain ? .5 : 1) × random(.7,1.3)`. A rain day therefore doubles the arrival rate on top of its traffic increase.

## Rating, tips, and experience

Start each completed customer's rating at five. Subtract one after more than 50% of patience is used; another after more than 82%. Subtract one if any noodle in their group was raw or soft; subtract one for expensive components; subtract up to two for prior wrong dishes. There is a further 10% random one-star deduction. A non-expensive average dish price below 88% of suggested price restores one point if below five. Valid secret broth restores one point if below five. Clamp the result to 1–5. Evidence: `dh()`.

Reputation is the mean of the most recent 30 review stars, default four before any reviews. A food reviewer contributes their result three times. Timed-out ordinary customers leave one star, or two stars with 30% probability. Evidence: `At()`, `bo()`, `ph()`.

Tips are computed on completing the whole customer/group, not on each partial bowl:

- Normal dine-in base tip = `round(remainingPatience / maxPatience × 4) × 1,000 × bowlCount`.
- Level-seven challenge day doubles this base if any bowl has spice seven. Tourist customers double it again.
- Tip jar multiplies this by 1.5 and rounds to the nearest 1,000.
- At rating four or five, painted bowl set adds 3,000 per bowl. Lucky cat adds 5,000 per bowl with a 25% chance.
- Secret broth adds 2,000 per matching bowl. Payday doubles the resulting tip.
- Normal app orders do not receive these dine-in tips; their sale carries a 20% application fee. Far-delivery mini-games may provide their own tip adjustment.
- Cashier does **not** give a guaranteed percentage tip. Their benefit is preventing payment incidents.

Every sold bowl grants ten XP. On the final bowl of a group, add eight XP for five stars or four XP for four stars; a reviewer doubles this star bonus. Five-star groups advance the consecutive-customer combo; any lower rating, wrong dish, or abandonment resets it. Evidence: `fh()`, `bo()`, `Ht()`.

Level gates and titles are in `LEVELS`; thresholds are 0, 150, 450, 900, 1,500, 2,300, 3,300, 4,500, 6,000, 8,000.

## Daily goals

Draw three distinct eligible goals each morning. Every goal selected at level L awards `(15 + 5L) × 1,000` cash and `25 + 5L` XP once, as soon as completed (the no-abandonment goal resolves at closing). Evidence: `pe`, `Nc()`, `vn()`, `Sc()`.

| Goal | Target | Eligibility |
|---|---:|---|
| Bowls sold | 6 + 2L | always |
| Five-star customers | 2 + ceil(L/2) | always |
| Ideal noodle bowls | 5 + L | always |
| Bowls with spice at least five | 1 + floor(L/3) | level at least 3 |
| Consecutive five-star customers | 3 | level at least 2 |
| App orders delivered | 2 | delivery upgrade |
| No customer left unserved | 1 end-of-day check | must also have served at least one bowl |

## Staff and upgrades

Catalog wages/levels are authoritative. Hiring costs nothing immediately, is level gated, and can be reversed; firing in preparation avoids that day's wage. Equipment is one-time and most major equipment adds 6,000 daily utilities. Accessories and decorations add no utilities. `pot3` requires `pot2`. Purchases of new dishes/equipment/decor reserve enough cash for minimum opening stock. Evidence: `nh()`, `Rs()`, `jn()`.

- Chef automatically starts available pots according to outstanding bowls, keeping cooked/boiling stock below the lesser of three and outstanding need. Collect at progress .64 into a ready-noodle basket. Next automatic start is separated by .8 seconds. The player taps the basket to use one ready portion. Evidence: `rh()`.
- Broth helper fills the selected order's broth when the player takes a bowl; topping helper adds missing requested toppings only after the broth is correct. Both consume stock normally. Evidence: `lh()`, `mo()`.
- Buyer behavior is described above. Cashier prevents dine-and-dash/wrong-money incidents. Waiter slows patience loss and resolves spilled noodles.

## Daily events

Days whose day number modulo seven is zero or six are weekends. Otherwise, after day two, a 35% roll selects an event; the eligible pool contains rain twice and each of hot, students, reviewer, sale, cold, payday, festival once. From stage two, challenge appears twice in that pool. Otherwise there is no event. Evidence: `sa()`.

Special effects beyond traffic: hot weather caps chosen spice to a separately sampled 0–2 value; challenge has a 45% chance to choose spice seven; cold has a 60% chance to increase spice. Students trigger three visitor attempts at 45% of the day. Reviewer is scheduled from 35% of the day. Sale chooses one unlocked broth/topping.

## Closing, losses, and loans

Charge full rent 40,000, base utilities 15,000, equipment utilities, and active staff wages. Cash can become negative; unpaid overhead is not silently forgiven. Stock expiry and unfinished bowls/pots are recorded as waste, but their purchase cash was already spent and must not be charged again. Closing unserved customers count as lost. Evidence: `fi()`.

If cash is negative or inadequate for minimum opening stock, offer recovery through loans while available; otherwise bankruptcy/new-shop restart. Maximum two loans. Suggested principal is the lesser of 1,000,000 and the larger of: 300,000 for the first loan (400,000 for the second), or the cash shortfall to minimum restock plus a 150,000 buffer rounded up to 50,000.

Minimum restock reserves five portions each of missing noodles, bowls, and the cheapest unlocked broth. The actual opening action requires at least one noodle, one bowl, and one broth portion; topping stock is not mandatory because no-topping orders exist.

Interest is 10% of new principal. The repayment installment includes existing debt plus the new principal and interest, divided by six nights and rounded up to the nearest 1,000. At closing pay the least of outstanding balance, installment, and nonnegative cash remaining after overhead. The accounting report separates repaid principal from interest. Evidence: `_a()`, `wn()`, `ht()`, `no()`, `ci()`, `fi()`.

## Optional mini-games and payment choices

Market bargaining is available once each game day. Three rounds use a triangular moving needle with speeds .8, 1.1, and 1.45. A green target of width .16, .13, or .10 is centered at a random position from .22 to .78; yellow extends another .10 on either side. Stopping in green earns 5% purchasing discount, yellow 2%, otherwise zero. Discounts add to at most 15%, persist immediately, and expire next day. Closing early preserves the earned discount but consumes the day's attempt. Apply the discount after any ingredient sale multiplier, round the normal unit price to 10, then apply the rush multiplier and round to 100. Evidence: `Es()`, `js()`, `EA`.

Secret broth is offered from day three after the tutorial and excluded from the daily competition. Choose an unlocked broth; two attempts per day, with retries restricted to the first chosen broth. Eight spice options are lemongrass, chili, garlic, ginger, star anise, cinnamon, lime leaf, and shallot. A weekly and broth-specific deterministic permutation gives a four-item sequence at levels 1–3, five at levels 4–6, six at levels 7–10. Display one spice every 820 ms before hiding the recipe; one incorrect input fails the attempt. Success applies only that day: add one rating point up to five for a customer whose group includes that broth, and 2,000 per matching dine-in bowl. No stock is consumed by the recipe exercise. Evidence: `Jo`, `il()`, `ue()`, `dt()`, `dh()`.

Washing is offered after a solvent normal closing from day two, when at least three dine-in bowls were served. It is optional and lasts 15 seconds of active scrubbing. At most ten graphical bowls represent the actual stack proportionally; each completed graphical bowl recovers its portion of the stack. Pointer strokes erase the dirt mask and keyboard input sweeps a band; a bowl completes once its remaining dirt reaches at most 10%. Recovered bowls go directly to inventory, without paying for new bowls. End or skip once; do not award the same stack twice. Evidence: `fi()`, `nl()`, `tl()`; constants `gt=15`, `_h=10`, `Al=3`. The local implementation uses deliberate scrub-input progress rather than reproducing the original pixel-mask algorithm.

Payment incidents are eligible for normal dine-in customers from day two, excluding tutorial, VIP, and app customers. The daily limit is two before day four, then three; normally require a 30-second gap. The random event ranges are 5% dine-and-dash, 6% mistaken payment, 3% asking for credit, and 3% hair complaint. Cashier prevents the first two. Incidents pause the shop for a choice. Evidence: `Hh()`, `qn`.

- Dine-and-dash: chase with 65% recovery probability and remove six seconds from waiting customers; a staff chase recovers 85% and slows cooking for 12 seconds; ignoring loses the bill.
- Overpayment happens in 60% of mistaken-payment incidents, with 10,000/20,000/50,000 extra. Return it for a five-star review and .08 temporary traffic boost. Keeping it succeeds 70%; otherwise it is returned and the review becomes one star. Underpayment is 5,000/10,000: reminding recovers it 75%; otherwise lose it and receive three stars. Ignoring loses the shortfall.
- Customer credit: accepting loses the current bill and records a receivable. Next preparation, a single 75% chance returns it with a random 0/5,000/10,000 thank-you tip; otherwise write it off. Refusing has a 50% chance to receive payment; otherwise lose the bill and receive two stars. Evidence for collection: `WA()`.
- Hair complaint: refund the bill without a further review penalty; offer topping for 10,000 with 70% satisfaction, otherwise two stars; arguing succeeds 45%, otherwise one star and temporary traffic minus .10.
- A bargaining customer separately asks for the larger of 5,000 and 15% of their bill rounded to 1,000. Accepting grants five stars and temporary traffic +.05. Holding price is neutral 60%, otherwise three stars. Tea costs 3,000 and succeeds 80%; otherwise also concede half the requested discount, rounded to 1,000.

## Pause and persistence boundaries

The reference explicitly pauses customer and pot progression on visibility loss and presents a resume dialog. Its persistent state is separate from runtime queue/timer/pot/bowl state. A safe local implementation can preserve more active-session state, provided consuming stock, refreshing, importing and resuming never duplicate resources or lose charged ingredients silently.

Server-backed scoreboards, transfers, social messages and AI review replies must use independent local equivalents or explicitly configured services. The recreation should not call the original service or pretend locally simulated rankings are real players.
