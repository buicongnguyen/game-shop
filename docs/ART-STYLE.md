# Art style guide

Every picture in Tiệm Mì Cay is original and drawn as SVG (or on a canvas for the mini-games). The reference game was studied for *what* it illustrates — one picture per object, characters with moods, decorations placed in the shop — never for its images. Do not trace, decode or imitate the reference's pictures, and do not draw any existing character.

## Look

- **Warm hand-drawn sticker style.** Chunky, readable silhouettes; slightly irregular, friendly shapes.
- **Vivid and warm, never pastel or beige-washed.** Saturated fills, with cream used only as a highlight or paper colour.
- **Outline:** `#4a2a22` (deep warm brown), round caps and joins. At a 128-unit viewBox use a 3-unit stroke; scale proportionally elsewhere (about 2.3% of the picture's width).
- **Shading:** one darker tone of the fill on the side away from a top-left light, as a flat shape (no blurred gradients needed). Linear gradients are welcome for broths, sky and metal.
- **Highlights:** white at 35–55% opacity, small curved strokes or ellipses on the top-left.
- **Ground shadow:** an ellipse in `#3a1d16` at 10–14% opacity under standing objects.
- **Night scenes** are the exception to "warm": very dark blue sky (`#0e1a3a` to `#1b2a55`), with the vivid colour in lights and windows. Distant buildings need setbacks, shaded faces and lit windows, never flat rows of rectangles.

## Palette

| Role | Colours |
| --- | --- |
| Chili / brand red | `#e8402f`, shade `#b92b22` |
| Tomato / orange | `#ef5a3c`, `#f59a3a`, shade `#c9672a` |
| Mustard / egg | `#f7c242`, shade `#c99420` |
| Cream / paper | `#fff3dc`, `#ffe7c2` |
| Leaf green | `#5fae4e`, shade `#3f8a3a`; mint `#8fd3a7` |
| Sky / water | `#6cc3ef`, deep `#2f7fc1`; teal `#2f8f8a` |
| Plum / berry | `#8a4d9e`, pink `#f28ab2` |
| Wood | `#b06a3b`, dark `#7a4426`, light `#d99a5e` |
| Metal | `#c9d3db`, shade `#8e9aa6`, highlight `#ffffff` |
| Skin tones | `#f9d2b4`, `#efc19c`, `#d9a27a`, `#b97d56`, `#8d5a3b` |

## Technical rules

- **ViewBox conventions:**
  - Ingredient icons: `0 0 128 128`, the object centred, about 100 units wide, ground shadow at y≈112.
  - Portraits: `0 0 80 80`, drawn inside a circle.
  - The bowl: `0 0 160 120`.
- **Ids must be unique on the page.** Generators take or create an id prefix (for example `face-<seed>-`) for every `id`, `clipPath` and gradient, because many pictures share one document.
- **Animation:** use CSS classes such as `.steam`, `.bob` or `.twinkle`, defined in `src/style.css`, so `prefers-reduced-motion` and the in-game motion setting can turn animation off. Do not use SMIL.
- **No external references:** no fonts, images or URLs inside an SVG. Text in pictures (signs, menus) is drawn by the generator with the page font inherited, or avoided.
- **Size budgets:**
  - an ingredient icon: under 6 KB;
  - a portrait string: under 5 KB;
  - the shop scene: under 60 KB;
  - the street backdrop: under 30 KB.
- **Accessibility:** decorative SVG gets `aria-hidden="true"`; meaningful pictures get `role="img"` and an `aria-label` set by the caller.
