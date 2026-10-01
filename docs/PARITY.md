# Parity matrix — Tiệm Mì Cay vs the reference

Reference: [aenhatrang.com](https://aenhatrang.com/), its public HTML and delivered browser script, studied 2026-09-30 to 2026-10-01.
- **What was copied:** behaviour only — rules, numbers, flows, what gets illustrated.
- **What is original:** the code, art (SVG and canvas), Vietnamese writing and synthesised sound were all made for this project. None of the reference's code, pictures, text or audio is included.
- **Sources:**
  - [reference-values.md](../reference-values.md) records the observed rules and where they come from in the reference;
  - [AUDIT.md](../AUDIT.md) records how each part was verified.

**Statuses:**
- **verified**: implemented, tested, and compared with the reference;
- **done**: implemented and tested;
- **partial**: implemented in part;
- **differs**: deliberately different;
- **missing**: not implemented.

## Look and illustration

| Feature | Aspect | Reference | Tiệm Mì Cay | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Every object has its own picture | visuals | 86 embedded illustrations | Original generators: `src/art/people.js`, `src/art/bowl.js`, `src/art/scene.js`; 32 redrawn ingredient icons; canvas art in `src/ride.js` | verified | Side-by-side sheets at 430×932 and 1366×768; `tests/art-*.test.js` |
| Shop scene | visuals | Hand-drawn storefront; pets placed in it | Detailed storefront with the selected awning, pet, plant and lamp, plus every purchased upgrade drawn as its own layer | verified | `data-layer` checks in `parity-browser.mjs`; contact sheets |
| Prep layout | layout | Large shop picture on the left; the bargaining banner (with vendor) and today's goals at the top of the stock tab | Same placement; the market vendor is our own character | verified | Side-by-side `desktop-prep`, `phone-prep` |
| Service background | visuals | Flat burgundy panel | A street that follows the day (morning to night) with rain on rainy days | differs | Richer on purpose; static image, so it adds no frame cost |
| Customers | visuals | Persona portraits with moods | Ten persona portraits (including tourist and astronaut) whose mood follows patience; staff portraits; the mascot with five moods | verified | `art-people.test.js`; ring screenshots |
| Kitchen | visuals | Pot per broth, idle or boiling noodle pot, bowl stack, chili bottle | Per-broth pot icons, a noodle pot with a flame while boiling, the bowl drawn from its real contents, a chili-sauce bottle with a counter | verified | `art-bowl.test.js`; screenshots |
| Locked items | visuals, rules | Locked broths and toppings shown greyed with a padlock | Items up to two levels ahead shown greyed with a padlock; unlockable ones open a rush purchase that includes the unlock fee | done | `shots5/phone-spotlight-2.png` |
| Page background | visuals | Grid paper with doodles | Grid paper with original doodles, in light and dark themes | done | `doodleTileDataURI` tests |
| Living street | visuals, motion | A flat panel; nothing moves behind the guests | Sparrows on the wires, passers-by (umbrellas in the rain), scooters and a bus on wide screens, a sunset flock, the lamp flickering on with moths, a rooftop cat, a weekend kite, the shop's pet, and short scenes for street stories; at most 3 actors on phones and 6 on wide screens | differs | Our addition: `src/life.js`, sprites in `src/art/life.js`; `life.test.js`, `art-life.test.js`, `life-browser.mjs` |
| Prep sign and mascot | visuals, feel | Sign pills (rename, board, cup, PvP, pranks) and a bobbing mascot that gives tips (context 60% of the time; one tip each morning) | Pills for rename, neighbours and records; our mascot Ớt Hiểm bobs and gives original tips with the same rules; petting the shop pet | done | `mascot-tips-and-petting-the-cat` |

## Rules and flows

| Feature | Aspect | Reference | Tiệm Mì Cay | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| First-run tutorial | flow, feel | Scripted guest; spotlight with the tip card beside the target | Scripted guest (Chị Hạnh) and a waiting clock; the spotlight dims everything but the next control; the tip card sits below or above it | verified | `situations.test.js`; `first-bowl-tutorial…` browser scenario; side-by-side `phone-tutorial` |
| Far-delivery ride | rules | At most 2 far app orders a day (20%, 30% in rain), ×1.25 patience; ride or hire for 15,000₫; three lanes; 4,500 units; first obstacle at 320; a hit gives 0.9 s invulnerability and 0.8 s slow; bonus 20k/10k/0; stars +1/0/−1 | Same numbers | verified | `delivery.test.js`, `ride.test.js`, `far-delivery-ride-settles-once` |
| Interplanetary delivery | rules | Not in the reference | Spaceport upgrade at level 9; five original planets; fuel bought before launch; canisters; asteroids, debris, comets; tiers pay a bonus and move stars | differs | User's request, built as an extension of the ride: `delivery.test.js`, `starship-flight…` |
| Street stories, payment incidents, haggling, stockouts | rules | Situation cap, windows, rolls fixed when a situation opens | Same mechanics, original stories | verified | `situations.test.js`; 100-day simulation |
| Price refusals and repeat avoidance | rules | Severe 2×, expensive 60,000₫ / 1.5×; 80% and 40%; last six orders | Same | verified | `situations.test.js` |
| Reviews and replies | rules | Two-day window, two messages, tone rules, star cap, +2 XP | Same | verified | `situations.test.js` |
| Events, morning cards, insolvency | rules | Weighted pool, morning chain, restock reserve | Same, with the next day's event fixed when a day closes; cards in the reference's order (gift, debts, level-up, what's new, neighbours, leave) | verified | `situations.test.js`, `delivery.test.js` |
| Kitchen love story | rules, text | Three stages between the noodle cook and the broth cook (1, 2, 3 days off); refusing: 65% walkout of 2–3 days, else half pay for two days; a 200,000₫ wedding gift adds +0.2 buzz on the return day; ×2 weight in the story pool, 4 days between stages | Same rules with our own characters (Bé Ngò and Anh Sả) and story; absence-aware automation and wages, morning notes, a pay line per person | verified | `staff.test.js`; `kitchen-love-story-leave-morning-and-staff-card`; 100-day simulation |
| Neighbour pranks | rules | Real players: 3 sends a day, one per shop, delivered at ~18/42/66% of their next day as street incidents or a haggler; morning card with "return the favour" | Six fictional neighbours (labelled as game characters) with the same limits, schedule, retries and carry-over; a local street board | differs | No server by design: `neighbours.test.js`; `neighbours-send-a-surprise-and-quota`, `neighbour-gifts-morning-card…` |
| What's new | flow | A versioned card from day 2 for older saves | Same, with our own release notes | done | `whats-new-shows-once-for-older-saves` |
| Terms of play | flow | Versioned gate with a checkbox; decline loops back; copy in Settings | Same flow with our own offline terms (no data leaves the device) | done | `terms-gate-blocks-until-accepted` |

## Feel, performance and platforms

| Feature | Aspect | Reference | Tiệm Mì Cay | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Feedback | motion, feel | Coins to the till, stamps, confetti, shakes | Coins fly to the wallet, "Tuyệt vời!" stamp, confetti, shake on refused taps, floating earnings | done | Screenshots |
| Small motions | motion, feel | Guests walk in (30 px, 0.45 s) and bob (3 px, 2.4 s); hearts on 5★; scoop with a splash in the broth colour; topping drop; broth droplets; bowl flies to the guest (520 ms arc); exit ghosts; ideal-zone sparks; sweat and hurry tells; chili squeeze, flames from level 5 and a level-7 shake; wallet count; 1.2 s choice lock | Same timings in a pooled effects layer (`src/fx.js`, `src/fx.css`) using transform and opacity only, paused behind dialogs, off with motion | verified | `fx.test.js`, `fx-browser.mjs`; trace numbers in AUDIT.md |
| Sound | audio | Cues and music | Original synthesised cues (44, including splash, clink, slurp, pet sounds and ride bumps) and two music loops | done | `audio.test.js` |
| Performance | performance | — | Same or less paint, layout and script work per second than the previous build on a 4×-slowed phone | verified | Trace numbers in AUDIT.md |
| Phones and PCs | mobile | Responsive | Fit-the-screen layouts from 320×568 to 1920×1080 | verified | `mobile-layout.mjs` 19/19, `mobile-interaction.mjs` 26/26 |
| Saves | persistence | Local | Validated saves including every new field and pending trips | verified | Simulation round-trip at every step |
| Install and offline | platforms | Web manifest, install prompt or manual steps, iPhone tip; no service worker | Same, plus a service worker for offline play that updates only on the prep screen | done | `pwa.test.js`, `pwa-browser.mjs` |
| Online play | online | Leaderboards, server AI replies | Not connected; local records only | missing | By design: no backend |

## Still open

Online features stay out of scope (leaderboards against real players, the daily cup's server boards, PvP, server-written review replies); the neighbours and the street board are local stand-ins.
