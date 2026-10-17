# The 3D watch

File: `apps/web/components/ProceduralWatch.tsx` (React Three Fiber + drei). There is **no GLB model**: the watch is built from code (lathe geometry for the case, canvas textures for dials, small meshes for hands, indices and gears). `WatchCanvas.tsx` wraps it in a `<Canvas>`; `WatchThumb.tsx` is a lightweight SVG fallback used on cards.

## Props

| Prop | Meaning |
|---|---|
| `dial`, `caseColor`, `strap`, `metal` | Colours, driven by the selected variant (`lib/colors.ts`) |
| `watchStyle` | `dress`, `diver`, `chrono`, `skeleton` or `field` |
| `live` | Hands show the real time |
| `explodable` | Enables the exploded view (product page only) |
| `showLabels` | Part labels while exploded |

## Styles

`watchStyleFor(product)` in `lib/colors.ts` picks a style from the product's category slug, tags and name. Each style changes the dial texture, indices, hands and case:

- **dress**: slim, baton indices, no extras
- **diver**: chunky case, rotating-style bezel with ticks and lume pip, crown guard, round lume dots
- **chrono**: three sub-dials, two pushers
- **skeleton**: see-through dial (`alphaTest`, double-sided) showing animated gears
- **field**: large Arabic numerals

## Exploded view (do not change casually)

The product page sets `explodable` and a minimum camera distance of 4.9. The explode factor is computed each frame from the camera distance:

```
f = smoothstep((6.9 - cameraDistance) / 2.0)      // 0 = assembled, 1 = fully exploded
part.position.z = basePosition + explodeOffset * f
root rotation y = f * 0.7, x = -f * 0.22, scale = 1 - f * 0.12
```

Zooming in separates the layers (crystal, hands, dial, movement gears, case back, strap); zooming out reassembles them. The behaviour is deliberate and was requested explicitly, so any 3D change must keep it intact. Part labels are drei `Html` overlays.

## Adding a style

1. Add the name to `WatchStyle` and a branch in `dialTexture`.
2. Add flags (`isX`) near the top of the component and the extra meshes.
3. Teach `watchStyleFor` which categories or tags map to it.
4. Check both the assembled and the zoomed-in view in a browser.

## Using a real GLB later

Product3DModel rows and the upload endpoint (`POST /admin/uploads/model`) already exist, but the exploded view only works on the procedural model. Real models would need named parts per mesh to be exploded.
