# patchbay examples

Runnable, self-verifying examples. Each one asserts the behavior it demonstrates and exits 0 on success.

| Example | Demonstrates |
| --- | --- |
| [`01-zooming-keeps-the-point-under-the-cursor-still.mjs`](./01-zooming-keeps-the-point-under-the-cursor-still.mjs) | `zoomAt()` keeps the world point under the cursor fixed through repeated zooms in and out, including when the zoom hits `minZoom` and is clamped. |
| [`02-fit-frames-every-node-in-the-container.mjs`](./02-fit-frames-every-node-in-the-container.mjs) | `fit(boundsOf(nodes), size, { padding })` puts every node inside the container, padding included, even for nodes at negative coordinates. |
| [`03-a-wire-leaves-right-and-arrives-from-the-left.mjs`](./03-a-wire-leaves-right-and-arrives-from-the-left.mjs) | `wirePath()` produces a cubic whose handles leave the source rightward and enter the target from the left, looping around when the target is behind the source. |
| [`04-cards-and-wires-in-a-browser/`](./04-cards-and-wires-in-a-browser/) | The whole kit in a page: pan, zoom, drag cards, drag-to-connect, drop to create, and a scrollable list that keeps its own wheel via `data-patchbay-ignore`. **Not** part of `npm run examples` -- see below. |

## Running

```sh
npm run examples      # 01-03
npm run example:01    # one
npx serve .           # then open /examples/04-cards-and-wires-in-a-browser/
```

## Runtime requirements (honest edition)

01-03 run under plain Node >= 26: the viewport math and `wirePath()` touch no DOM. Example 04 needs a real browser (pointer capture, `elementFromPoint`, layout), so it is excluded from `npm run examples`; the same behaviors are covered headlessly by `test/dom.test.mjs` under happy-dom.
