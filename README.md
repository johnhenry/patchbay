# patchbay

[![npm version](https://img.shields.io/npm/v/%40johnhenry%2Fpatchbay.svg)](https://www.npmjs.com/package/@johnhenry/patchbay)
[![CI](https://github.com/johnhenry/patchbay/actions/workflows/ci.yml/badge.svg)](https://github.com/johnhenry/patchbay/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/%40johnhenry%2Fpatchbay.svg)](LICENSE)

Full documentation: [opensource.johnhenry.me/patchbay](https://opensource.johnhenry.me/patchbay/)

A pannable, zoomable canvas, and the wires between things on it.

Node editors, spatial notebooks, whiteboards and patch-cable UIs all need the same two pieces: a viewport (screen-to-world math, zoom about the cursor, wheel/pinch/drag/keyboard gestures, zoom-to-fit) and wires (curves between ports that follow the things they connect, plus a drag-to-connect gesture). patchbay is those two pieces and nothing else: no node model, no framework, no layout. Your content stays ordinary DOM inside one transformed element.

Zero dependencies. ESM. The viewport math and `wirePath()` run anywhere; the gesture and wire helpers need a DOM.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Coordinates](#coordinates)
- [Viewport API](#viewport-api)
- [Wires API](#wires-api)
- [Styling](#styling)
- [Honest limitations](#honest-limitations)
- [Family](#family)
- [License](#license)

## Install

```sh
npm install @johnhenry/patchbay
```

**Provenance:** a new package, never published under another name. Under npm's caret rules `^0.0.0` matches only `0.0.0`, so pin exactly until a deliberate `0.1.0`.

## Quick start

```html
<link rel="stylesheet" href="node_modules/@johnhenry/patchbay/src/patchbay.css" />
<div id="stage" class="patchbay-stage" tabindex="0">
  <div id="world" class="patchbay-world">
    <svg id="wires" class="patchbay-wires"></svg>
    <!-- your nodes, absolutely positioned in world units -->
  </div>
</div>
```

```js
import { createViewport, attachViewport, createWires, connectDrag } from "@johnhenry/patchbay";

const viewport = createViewport({ minZoom: 0.2, maxZoom: 3 });
const { coordinates } = attachViewport(viewport, { container: stage, world });

const wires = createWires({
  svg: document.querySelector("#wires"),
  resolve: (port) => portPosition(port), // your function: port -> { x, y } in world units
});
wires.set("a->b", { from: "a:out", to: "b:in" });
// after nodes move: wires.schedule()  (one redraw per frame)

outPort.addEventListener("pointerdown", (event) =>
  connectDrag({
    svg: document.querySelector("#wires"),
    event,
    from: portPosition("a:out"),
    toWorld: coordinates.toWorld,
    hitTest: (x, y) => document.elementFromPoint(x, y)?.closest("[data-node]")?.dataset.node,
    onConnect: (nodeId) => connect("a", nodeId),
    onDrop: (point) => createNodeAt(point), // released over empty canvas
  }),
);
```

A complete page: [`examples/04-cards-and-wires-in-a-browser/`](examples/04-cards-and-wires-in-a-browser/).

## Coordinates

- **Client** pixels are what pointer events report.
- **Screen** pixels are relative to the stage container's top-left.
- **World** units are your content's own, unscaled: put nodes at world positions and never think about zoom again.

`screen = world × zoom + (x, y)`. `attachViewport()` returns `coordinates`, which goes straight from client to world: `coordinates.toWorld(event.clientX, event.clientY)`. It also has `toStage` (an alias, for libraries that call the world a "stage"), `scale()` (the zoom) and `toLocal()` (client to screen). Drag code that converts both the start and the current pointer through `toWorld` moves content 1:1 with the cursor at any zoom.

## Viewport API

`createViewport({ x = 0, y = 0, zoom = 1, minZoom = 0.1, maxZoom = 4 })` -- pure state, no DOM:

| Member | Does |
| --- | --- |
| `x`, `y`, `zoom`, `get()`, `set({ x, y, zoom })` | Read or replace the transform (zoom is clamped; non-finite values throw). |
| `panBy(dx, dy)` | Move the world by a screen delta. |
| `zoomAt(screenPoint, factor)` / `zoomTo(zoom, screenPoint)` | Zoom keeping the world point under `screenPoint` fixed, even when clamped. |
| `toWorld(screenPoint)` / `toScreen(worldPoint)` | Convert. |
| `visibleRect(size)` | The world rectangle a container of `size` shows. |
| `fit(rect, size, { padding = 24, maxZoom = 1 })` | Center `rect` and zoom to fit, never zooming in past `maxZoom`. |
| `centerOn(worldPoint, size)` | Center a point, keeping the zoom. |
| `transform()` | The CSS `translate(...) scale(...)` for the world element. |
| `subscribe(fn)` | Called with `{ x, y, zoom }` on every change; returns an unsubscribe function. |

`boundsOf(rects)` unions world rectangles (feed it to `fit`).

`attachViewport(viewport, { container, world, wheel = "pan", wheelZoomSpeed, panOnDrag, keyboard = true })` returns `{ coordinates, detach }` and:

- **wheel** pans and ⌘+wheel zooms about the cursor; `wheel: "zoom"` swaps those two. Ctrl+wheel and trackpad pinch (which browsers report as a Ctrl wheel) always zoom, at the same rate as ⌘+wheel. A mouse-wheel notch is capped to a modest zoom step (about 1.35×; `wheelZoomSpeed` defaults to `0.006`) so it doesn't jump.
- **drag** pans when `panOnDrag(event)` returns true; by default the middle button, a drag with Space held, or a primary drag that starts on empty canvas: the stage, the world element or the wire layer (not on your content).
- **touch**: two fingers pinch-zoom about their midpoint (`zoomAt(midpoint, distanceNow / distanceBefore)`) and pan with it (the midpoint's travel). A second finger cancels a one-finger pan, and the remaining finger does not resume it; lift both and start again. Touches that start inside `data-patchbay-ignore` content are left alone. Mouse and pen behaviour, and one-finger touch panning, are unchanged. `attachViewport` sets `touch-action: none` on the container (restored on `detach()`) so the browser does not claim the gesture; a scrollable `data-patchbay-ignore` child keeps its own touch scrolling.
- **keyboard**, while the stage has focus: `+`/`=`/`-` zoom, `0` resets to 100%, arrows pan (Shift for bigger steps).
- **`data-patchbay-ignore`** on any element inside the stage gives it back its own wheel and drag: a scrollable output panel, a map, an interactive animation camera.
- applies `transform()` to `world` and sets `--patchbay-x`, `--patchbay-y` and `--patchbay-zoom` on the container.

## Wires API

| Export | Does |
| --- | --- |
| `wirePath(a, b, { from = "right", to = "left", curvature = 0.5, minHandle = 30 })` | SVG path data for a cubic from `a` to `b`, leaving `a` in direction `from` and arriving at `b` from side `to` (`right`, `left`, `up`, `down`). Pure. |
| `createWires({ svg, resolve, schedule })` | A keyed set of `<path>`s in a world-space `<svg>`. `resolve(endpoint)` maps an endpoint (a port id, an element, anything) to a world point; `undefined` hides the wire. Methods: `set(id, { from, to, className, shape, title })`, `delete`, `has`, `ids`, `element(id)`, `retain(ids)`, `update()` (now), `schedule()` (next frame, coalesced), `clear()`. |
| `connectDrag({ svg, event, from, toWorld, hitTest, onConnect, onDrop, onCancel, onHover, shape })` | Draws a pending wire from `from` to the pointer until release. Over a target (`hitTest` truthy): `onConnect(target, point)`; over empty space: `onDrop(point)`; Escape or pointercancel: `onCancel()`. `onHover(target)` fires as the target under the pointer changes. Returns `{ cancel }`. |
| `anchorOf(element, toWorld, { side, offset })` | A world point on a side of an element, measured from its client rect. |

## Styling

`@johnhenry/patchbay/patchbay.css` is optional: `.patchbay-stage` (a dot grid that pans and scales with the world), `.patchbay-world`, `.patchbay-wires` and `.patchbay-wire` (`vector-effect: non-scaling-stroke`, so wires stay crisp at any zoom; a wire with a `title` takes pointer events so its tooltip shows). Tokens: `--patchbay-background`, `--patchbay-dot`, `--patchbay-grid`, `--patchbay-wire`, `--patchbay-wire-width`, `--patchbay-wire-active`, with `light-dark()` defaults.

## Honest limitations

- **It's a CSS transform.** Zooming scales your DOM, so text is re-rasterized (crisp in modern browsers) and very large worlds at very small zoom still lay out every node; cull off-screen nodes with `visibleRect()` if you have thousands.
- **No node model.** Positions, selection, snapping and undo are yours. `coordinates` plugs into a window manager that has them ([window-algebra](https://github.com/johnhenry/window-algebra)'s input adapter accepts a coordinates hook).
- **Wires don't route around things.** They're single cubics; with many crossing wires, you get spaghetti, as on a real patch bay.
- **Touch pinch/pan is two fingers, no rotation.** A third finger is ignored; touch-screen pinch is implemented with pointer events, trackpad pinch still arrives as a Ctrl+wheel. Not yet verified on a physical touch device (the tests drive pointer events under happy-dom).

## Family

patchbay is the spatial layer: it places things and draws the lines between them; other packages decide what the things are.

- **[`@johnhenry/window-algebra`](https://github.com/johnhenry/window-algebra)** -- floating windows with drag, resize, stacking and undo. Pass patchbay's `coordinates` (`toStage`, `scale`) to window-algebra's input adapter and its floating windows live on a zoomable, unbounded canvas.
- **[`@johnhenry/dataflow`](https://github.com/johnhenry/dataflow)** -- a node graph's edges are dataflow's `deps`; draw each dependency as a wire with `wires.set(\`${dep}->${id}\`, ...)` and color it by the source's run state.
- **[`@johnhenry/ecmanim`](https://github.com/johnhenry/ecmanim)** -- an interactive ecmanim canvas (`attachInteractiveCamera()`) inside a patchbay stage keeps its own pan and zoom when its container carries `data-patchbay-ignore`.

## License

MIT
