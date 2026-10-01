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

## Rules and flows

| Feature | Aspect | Reference | Tiệm Mì Cay | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| First-run tutorial | flow, feel | Scripted guest; spotlight with the tip card beside the target | Scripted guest (Chị Hạnh) and a waiting clock; the spotlight dims everything but the next control; the tip card sits below or above it | verified | `situations.test.js`; `first-bowl-tutorial…` browser scenario; side-by-side `phone-tutorial` |
| Far-delivery ride | rules | At most 2 far app orders a day (20%, 30% in rain), ×1.25 patience; ride or hire for 15,000₫; three lanes; 4,500 units; first obstacle at 320; a hit gives 0.9 s invulnerability and 0.8 s slow; bonus 20k/10k/0; stars +1/0/−1 | Same numbers | verified | `delivery.test.js`, `ride.test.js`, `far-delivery-ride-settles-once` |
| Interplanetary delivery | rules | Not in the reference | Spaceport upgrade at level 9; five original planets; fuel bought before launch; canisters; asteroids, debris, comets; tiers pay a bonus and move stars | differs | User's request, built as an extension of the ride: `delivery.test.js`, `starship-flight…` |
| Street stories, payment incidents, haggling, stockouts | rules | Situation cap, windows, rolls fixed when a situation opens | Same mechanics, original stories | verified | `situations.test.js`; 100-day simulation |
| Price refusals and repeat avoidance | rules | Severe 2×, expensive 60,000₫ / 1.5×; 80% and 40%; last six orders | Same | verified | `situations.test.js` |
| Reviews and replies | rules | Two-day window, two messages, tone rules, star cap, +2 XP | Same | verified | `situations.test.js` |
| Events, morning cards, insolvency | rules | Weighted pool, morning chain, restock reserve | Same, with the next day's event fixed when a day closes | verified | `situations.test.js`, `delivery.test.js` |

## Feel, performance and platforms

| Feature | Aspect | Reference | Tiệm Mì Cay | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Feedback | motion, feel | Coins to the till, stamps, confetti, shakes | Coins fly to the wallet, "Tuyệt vời!" stamp, confetti, shake on refused taps, floating earnings | done | Screenshots |
| Sound | audio | Cues and music | Original synthesised cues and two music loops | done | `audio.test.js` |
| Performance | performance | — | Same or less paint, layout and script work per second than the previous build on a 4×-slowed phone | verified | Trace numbers in AUDIT.md |
| Phones and PCs | mobile | Responsive | Fit-the-screen layouts from 320×568 to 1920×1080 | verified | `mobile-layout.mjs` 19/19, `mobile-interaction.mjs` 26/26 |
| Saves | persistence | Local | Validated saves including every new field and pending trips | verified | Simulation round-trip at every step |
| Online play | online | Leaderboards, server AI replies | Not connected; local records only | missing | By design: no backend |

## Still open

Not implemented yet:
- staff absences and the staff romance story;
- neighbour pranks;
- what's-new cards;
- terms and install screens.

Online features stay out of scope.
