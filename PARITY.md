# Reference parity — independent local recreation

Reference inspected: [aenhatrang.com](https://aenhatrang.com/), its public HTML and delivered browser script, on 2026-09-30. A second, deeper pass on 2026-10-01 covered situations, edge cases and how each one is resolved. This is a comparison of rules and behaviour, not a claim of exact runtime, artwork or online parity. None of the reference's code, text, images or music is included: the local code, SVG art, Vietnamese writing and synthesised sound were all made for this project.

[reference-values.md](reference-values.md) records the observed rules and the source functions they come from. It describes the reference; it does not claim every rule is implemented here.

## What is implemented

| Area | Local behaviour | Remaining difference |
| --- | --- | --- |
| Opening | Shop naming, 400,000₫ start, empty stock, editable 0–99 cart with the reference's suggested-cart algorithm and customer forecast. A new shop is coached through one scripted first guest (patience 99, one stocked broth and topping, chili 1). The day clock waits; a step-by-step coach outlines the next control; Skip is available; a completion card follows | The swipe-through intro carousel, terms and install screens are replaced by six help pages |
| Ingredient catalog | 32 entries: two bases, nine broths, 21 toppings, with purchase and selling prices, unlock fees and level gates | — |
| Stock and expiry | Stock is used the moment it goes into a bowl or pot; costed FIFO batches; perishables expire at closing; purchases keep a reserve for five bowls, noodles and broth when those are missing | The local ledger groups some of the reference's accounting categories |
| Bowl assembly | Additions can't be undone; up to four distinct toppings; chili to level 7; explicit discard | Local animations and kitchen arrangement differ |
| Noodles | 5.2 s pot (4.2 s with the stove); raw below 50%, ideal to 78%, soft after, lost at 100%; several pots; the chef only harvests pots she started | The animated scoop is a direct tap |
| Serving | Selected customer first, then any matching order or unfinished group dish; a wrong dish is wasted and costs the customer patience. Every review names its cause; the text comes from an original voice module and never repeats the last twelve | — |
| Customers | Level-based toppings, spice and groups; stage notes at levels 3 and 7. Guests avoid the broths and toppings of the last six orders: each weighs 1 / (1 + 1.5 × recent appearances). Eight local personas with names and forms of address. From day 3, 13% of guests have a trait: hurried (×0.6 patience, tagged), fickle (changes spice once below 70% patience and says so), haggler (asks for 15%, at least 5,000₫, after eating). Tourists arrive from a street story and double the tip. Each order is shown as a spoken line | Persona illustrations are procedural portraits |
| Stockouts | A guest whose dish is sold out switches to a stocked option half the time, or walks away (35% leave a 2–3★ review). During service the ticket marks the missing item with a Handle button: rush 5 at 150%, offer a swap (3 in 4 accept), drop the topping at a lower price, wait for the buyer, send the guest away (30% chance of a 2–3★ review) or decide later. Tapping an empty ingredient offers a one-tap rush order | — |
| Delivery | Separate two-slot app queue, one bowl, 20% fee, longer patience, last-ten-second cutoff; rain doubles app orders; a late app order leaves 1★ | Far-delivery riding is not implemented |
| Daily events | Each day's event is fixed when the previous day closes, so unlocking or levelling up in the morning can't change the preview. Weekends by calendar; on other days a 35% roll picks from a weighted pool (rain twice, the spicy challenge twice from level 3). A sale discounts an unlocked item, and cold weather sets a spice floor. Events are announced when the shop opens and previewed on the day card | — |
| Day and closing | 210 s of arrivals, a 20 s warning, up to 60 s to finish orders. Walkouts leave 1★ (70%) or 2★; a reviewer's walkout adds two more 1★. Guests still waiting at closing leave no review | The day closes on the next tick instead of after an exit animation |
| Prices | The prices tab shows the suggested price, the supplier cost and a tag (cheap below 85%, a bit high, far too high). A broth above 60,000₫ or a topping above 1.5× its suggested price is expensive: 40% of guests refuse such a dish, and it costs a star. Anything above twice its suggested price is severe: 80% of passers-by walk on, and 1 in 10 posts a 1–2★ review. The photo menu raises every limit by 20%. Students, the reviewer and invited tourists ignore prices. Price walk-aways are counted separately in the day summary | — |
| Economy | Component prices, price effects, FIFO waste, two loans at 10% over six nights. When the till can't cover the minimum restock, opening is blocked until a loan, or a fresh shop once both loans are used. The disabled Open button explains why | — |
| Progression | Ten levels. Goals pay the moment they are met; the no-walkout goal is settled at closing. Level-ups show a toast during service and an unlock card next morning | — |
| Staffing | The cashier blocks dine-and-dash and short payments and says so. The waiter mops spills himself. The buyer leaves the moment an item runs out: 12 s per trip, one trip per item, four a day, never while closing, paying today's price. The chef keeps up to three portions going. Broth and topping helpers | Staff absences and the staff romance story are not implemented |
| Payment incidents | Paused choices for dine-and-dash, over- or short payment, credit and a hair in the bowl. Outcomes are rolled when the situation opens, so reloading can't change them. Every outcome has its own message. A failed dash also removes that guest's review | — |
| Street stories | 15 original stories fall in up to three daily windows (40% each on day 2, 60% later). They wait while a bowl is in hand and share a daily cap with payment incidents (2 a day until day 3, then 3). Effects include money, word of mouth today or tomorrow, waiting patience, a slow stove, a dirty floor (three taps to mop; an inspection after 35 s), a noisy guest, tourists, an office takeaway and spoiled toppings. The shop cat and the waiter settle some stories unaided | The stories and their wording are original, not the reference's set |
| Morning | One card at a time: a windfall (12% from day 3), each debt repaid (75%, with a 0/5k/10k thank-you) or written off, and the level-up card | The reference's what's-new, prank and staff-story cards are not implemented |
| Market bargaining | Three timing rounds, 5% green or 2% yellow, up to 15% off for that day | Gauge art differs |
| Secret broth | Available from day 3; weekly recipe, 4 to 6 steps by level; two tries a day; +1★ and 2,000₫ per matching bowl | Recipe order is seeded locally |
| Washing | Optional 15 s game after an eligible closing, recovering up to ten bowls | Scrub progress, not pixel-level dirt |
| Decoration | Awnings, plants, lamps and pets, shown at the shop; the cat catches rats | One selected plant and lamp rather than free placement |
| Reviews and replies | Star histogram, filters including "not yet answered", a tab badge and 40 per page. Replies are allowed for two days, with two owner messages of up to 120 characters, each answered by the guest. A rude reply costs a star. A polite one lifts a review under 4★ 60% of the time (neutral: 25%), never above the first rating + 2. The first polite reply to a 4–5★ review earns 2 XP. Three suggested replies per cause and a cheeky option | Guest answers are written offline; no server AI |
| Records | Finances, personal records and a seeded daily challenge kept apart from the main shop | No real-player rankings |
| Sound | Synthesised effects for each action and situation, plus two original music loops (prep and service), with separate toggles | No volume sliders |
| Saving | Auto-save, validated JSON import/export, the live bowl, pots, customers and pending situation, migration of older saves (single replies become a thread) | Browser-local only: no cloud sync or transfer codes |
| Pause and access | Every dialog pauses service. Situation choices lock for one second so a tap meant for the kitchen can't answer. Refused taps shake the control. Hidden-tab pause, keyboard control, dark theme and reduced motion | The reference's exact screen-reader behaviour and animation timing are not reproduced |

## Remaining reference features

Not implemented:
- far-delivery riding
- staff absences
- the staff romance and neighbour-prank story lines
- what's-new cards
- persona illustrations

Online leaderboards, shared competitions, neighbouring shops, account transfer and server AI replies are not connected. The local record screen says so, and no online players or rankings are invented.

Blender and Unity are not needed. The game is a 2D browser interface drawn with small, sharp SVGs, and the bowl and pots are drawn from live game state.

## Verification scope

Current verification is in [AUDIT.md](AUDIT.md). Reference observations, engine tests and browser checks are different kinds of evidence. None of them proves an exact match for every reachable reference state.
