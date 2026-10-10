// "Zoom to fit": the bounding box of every node ends up centered and inside the container.
import assert from "node:assert/strict";
import { createViewport, boundsOf } from "@johnhenry/patchbay";

const nodes = [
  { x: -300, y: 40, width: 200, height: 120 },
  { x: 900, y: -200, width: 240, height: 90 },
  { x: 100, y: 700, width: 180, height: 60 },
];
const container = { width: 1024, height: 640 };
const vp = createViewport().fit(boundsOf(nodes), container, { padding: 32 });
for (const n of nodes) {
  const tl = vp.toScreen({ x: n.x, y: n.y });
  const br = vp.toScreen({ x: n.x + n.width, y: n.y + n.height });
  assert.ok(tl.x >= 32 - 1e-6 && tl.y >= 32 - 1e-6 && br.x <= container.width - 32 + 1e-6 && br.y <= container.height - 32 + 1e-6);
}
console.log("ok: all", nodes.length, "nodes visible at zoom", vp.zoom.toFixed(3));
