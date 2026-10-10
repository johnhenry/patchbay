// Zooming about the cursor (wheel/pinch) must not slide the content under it.
import assert from "node:assert/strict";
import { createViewport } from "@johnhenry/patchbay";

const vp = createViewport({ x: 120, y: -40, zoom: 0.8, minZoom: 0.25, maxZoom: 3 });
const cursor = { x: 412, y: 233 };
const anchor = vp.toWorld(cursor);
for (const factor of [1.1, 1.1, 2, 0.3, 10, 0.01]) {
  vp.zoomAt(cursor, factor);
  const now = vp.toWorld(cursor);
  assert.ok(Math.abs(now.x - anchor.x) < 1e-9 && Math.abs(now.y - anchor.y) < 1e-9, `drifted at zoom ${vp.zoom}`);
}
assert.equal(vp.zoom, 0.25, "clamped at minZoom");
console.log("ok: world point", anchor, "stayed under the cursor through 6 zooms; final zoom", vp.zoom);
