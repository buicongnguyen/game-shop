# Public reference audit

Updated after the follow-up review. See PARITY.md for the more detailed, current client-source comparison and AUDIT.md for repaired local defects. These notes describe the reference; they are not a claim that every listed requirement is implemented locally.

Source inspected: https://aenhatrang.com/ on 2026-09-30. Findings come from the public page, CSS, and user-facing strings in its delivered script. No reference source or image files are included in this recreation.

## Product and visual facts

The reference is a Vietnamese 2D browser game about operating a spicy noodle stall. The central loop is buying stock, opening for customers, assembling their orders, earning money and reviews, then investing in the shop. The reference supports touch and desktop; Blender and Unity are unnecessary for this interface.

- Portrait application shell is 460px wide, with a burgundy outer background. Desktop landscape expands to a maximum of 1180px and uses two columns.
- Palette: outer burgundy `#7A3346`, header/dark burgundy `#5A2334`, cream tile `#FFF3F0`, tile lines `#F8E0DA`, white cards, deep brown text `#4A2A2A`, secondary text `#8A6A66`, chili red `#EF4B3F`, red shadow `#C23328`, egg yellow `#F7C948`, mint/green success.
- Reference typography is Paytone One for display headings and Mali for body text. Friendly round shapes, large touch controls, pill badges, 14px card corners, red raised primary buttons.
- Hero is a cute storefront with pink awning, lanterns, steaming noodles, an orange sleeping cat, plus a separate friendly red pepper mascot.
- Header during play shows the day and time on the left, cash prominently in the center, and review stars on the right.
- Prep layout: red awning-like shop sign, level/XP, secondary shop actions, daily event strip, six tabs, content card, and persistent large bottom action.
- Landscape prep puts the sign and shop illustration left and tabs/content right. Landscape service puts the customers and order left and the kitchen right.

## P0: complete playable local loop

1. Start screen with storefront, game title, short introduction, spice levels 0 through 7, start and help controls.
2. First-run tutorial and editable shop name. Persist progress in local storage.
3. Shop prep: an editable purchasing cart with ±1 controls, price changes, cash validation, stock availability, and a clear combined-purchase/open-shop action. Suggested quantities may round to five; the older tutorial wording is not the active control increment.
4. Customers arrive with a broth, topping(s), and spice level; selectable customer portraits include a visible countdown/patience indicator.
5. Cooking controls: take bowl, add broth, start noodles and collect them at the correct time, add toppings, add chili one level per tap, serve. Discard lets the player recover from a wrong bowl.
6. Noodle cooking must visibly distinguish raw, ideal, and overcooked. Correct composition and timing improve stars and tips. Bad/wrong orders and waiting reduce customer satisfaction.
7. Assembly deducts actual stock immediately. Serving pays money, creates a review, and awards XP; wrong dishes and discards waste the consumed ingredients. Cash and stock cannot go negative through repeated clicks.
8. End-of-day summary accounts for sales, tips, purchases, rent/utilities, food waste, and profit; continue to the next day.
9. Responsive portrait and landscape layouts and working keyboard-visible focus.

## P1: management depth

- Six prep areas: inventory, selling prices, upgrades, decoration, reviews, accounts.
- Unlock additional broths/toppings based on shop level; buy equipment; hire staff at daily wages.
- Upgrades may increase patience, cooking speed, customer capacity, or sales traffic.
- Shop decoration should visibly affect the awning or storefront preview.
- Daily goals and daily events; XP progress and level titles.
- Review list and simple local reply interactions.
- Accounts/history with daily revenue/expense figures.
- Settings for sound, theme, help, backup/restore, and reset.
- Leaderboard/daily competition screens should be explicitly local simulations if no backend is built.

## Reference game economy facts

Starting cash is 400,000 VND; initial level is one and day is one. Owned stock begins empty; the suggested purchase cart is not inventory. Initial unlocked items are kimchi broth, noodles, bowls, American beef, and sausage. One reference selling day lasts 210 seconds. Rent is 40,000 and base utilities 15,000 per day; equipment can add utilities. A sale grants 10 XP with another 8 XP for a five-star customer.

| Item | Purchase cost/portion | Suggested sale component | Shelf life |
|---|---:|---:|---|
| Kimchi broth | 6,000 | 35,000 | same day |
| Noodles | 3,000 | included in dish | 5 days |
| Bowl and chopsticks | 1,500 | included in dish | no expiry |
| American beef | 9,000 | 15,000 | same day |
| Sausage | 3,000 | 8,000 | 3 days |

Other broths include tomyum, black bean, and cheese milk; later additions include mushroom, mala, pepper, chicken/herbs, and crab. Example equipment: better stove, second boiling pot, extra table, fan, Wi-Fi, and delivery orders. Staff roles include cashier, noodle cook, waiter, shopping assistant, broth assistant, and topping assistant.

## Reference onboarding semantics

The tutorial explains stocking first, reading customer orders and patience, the six-step bowl process, noodle timing, problems and stockouts, leveling and unlocking, daily goals/rankings, and installation to the home screen. It concludes with a shop-name field on first run. Help can later reopen the tutorial.

## Explicit local limitations to document

The reference has remote leaderboards, daily competition, cross-device transfers, social pranks, and externally generated review replies. A standalone local clone should either implement local equivalents clearly labeled as such or omit those remote features rather than claim live parity. Original illustrations and fresh code should be used; the reference explicitly reserves its code and art.
