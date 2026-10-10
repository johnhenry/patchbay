import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewport, boundsOf, wirePath } from "../src/index.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("toWorld and toScreen are inverses at any pan and zoom", () => {
  const vp = createViewport({ x: 37, y: -12, zoom: 1.7 });
  for (const p of [{ x: 0, y: 0 }, { x: 100, y: 250 }, { x: -40, y: 9 }]) {
    const back = vp.toScreen(vp.toWorld(p));
    close(back.x, p.x);
    close(back.y, p.y);
  }
});

test("zoomAt keeps the world point under the cursor fixed", () => {
  const vp = createViewport({ x: 10, y: 20, zoom: 1 });
  const at = { x: 300, y: 200 };
  const before = vp.toWorld(at);
  vp.zoomAt(at, 2.5);
  const after = vp.toWorld(at);
  close(before.x, after.x);
  close(before.y, after.y);
  assert.equal(vp.zoom, 2.5);
});

test("zoom is clamped to [minZoom, maxZoom], and the anchor point still holds", () => {
  const vp = createViewport({ minZoom: 0.5, maxZoom: 2 });
  const at = { x: 50, y: 50 };
  const before = vp.toWorld(at);
  vp.zoomAt(at, 100);
  assert.equal(vp.zoom, 2);
  close(vp.toWorld(at).x, before.x);
  vp.zoomAt(at, 0.0001);
  assert.equal(vp.zoom, 0.5);
});

test("panBy moves content with the drag", () => {
  const vp = createViewport();
  vp.panBy(30, -10);
  assert.deepEqual(vp.get(), { x: 30, y: -10, zoom: 1 });
  assert.deepEqual(vp.toWorld({ x: 30, y: -10 }), { x: 0, y: 0 });
});

test("fit centers a rect and respects the zoom cap", () => {
  const vp = createViewport();
  vp.fit({ x: 0, y: 0, width: 1000, height: 500 }, { width: 548, height: 548 }, { padding: 24 });
  close(vp.zoom, 0.5);
  const center = vp.toScreen({ x: 500, y: 250 });
  close(center.x, 274);
  close(center.y, 274);
  vp.fit({ x: 0, y: 0, width: 10, height: 10 }, { width: 800, height: 600 });
  assert.equal(vp.zoom, 1, "small content isn't blown up past maxZoom 1 by default");
});

test("visibleRect and centerOn agree", () => {
  const vp = createViewport({ zoom: 2 });
  vp.centerOn({ x: 100, y: 100 }, { width: 400, height: 200 });
  const r = vp.visibleRect({ width: 400, height: 200 });
  close(r.x + r.width / 2, 100);
  close(r.y + r.height / 2, 100);
  close(r.width, 200);
});

test("subscribe fires on change only, with a snapshot", () => {
  const vp = createViewport();
  const seen = [];
  const off = vp.subscribe((s) => seen.push(s));
  vp.set({ x: 0 }); // no change
  vp.panBy(1, 0);
  off();
  vp.panBy(1, 0);
  assert.deepEqual(seen, [{ x: 1, y: 0, zoom: 1 }]);
});

test("invalid input is rejected", () => {
  assert.throws(() => createViewport({ minZoom: 0 }), RangeError);
  assert.throws(() => createViewport({ minZoom: 2, maxZoom: 1 }), RangeError);
  assert.throws(() => createViewport().set({ x: NaN }), RangeError);
});

test("transform() is a CSS translate + scale", () => {
  assert.equal(createViewport({ x: 5, y: 6, zoom: 2 }).transform(), "translate(5px, 6px) scale(2)");
});

test("boundsOf unions rects", () => {
  assert.deepEqual(boundsOf([{ x: 0, y: 0, width: 10, height: 10 }, { x: -5, y: 20, width: 5, height: 5 }]), { x: -5, y: 0, width: 15, height: 25 });
  assert.equal(boundsOf([]), undefined);
});

test("wirePath leaves rightward and enters from the left by default", () => {
  const d = wirePath({ x: 0, y: 0 }, { x: 200, y: 100 });
  const nums = d.match(/-?[\d.]+/g).map(Number);
  // M a C c1, c2, b
  assert.deepEqual(nums.slice(0, 2), [0, 0]);
  assert.ok(nums[2] > 0 && nums[3] === 0, "first handle points right");
  assert.ok(nums[4] < 200 && nums[5] === 100, "second handle sits left of the target");
  assert.deepEqual(nums.slice(6), [200, 100]);
});

test("wirePath keeps a minimum handle for very short wires and honors directions", () => {
  const nums = wirePath({ x: 0, y: 0 }, { x: 1, y: 0 }, { minHandle: 30 }).match(/-?[\d.]+/g).map(Number);
  assert.equal(nums[2], 30);
  const down = wirePath({ x: 0, y: 0 }, { x: 0, y: 100 }, { from: "down", to: "up" }).match(/-?[\d.]+/g).map(Number);
  assert.ok(down[3] > 0, "leaves downward");
  assert.ok(down[5] < 100, "enters from above");
});
