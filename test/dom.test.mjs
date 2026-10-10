import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { createViewport, attachViewport, createWires, connectDrag, anchorOf } from "../src/index.mjs";

let window;
let document;
before(() => {
  window = new Window({ width: 800, height: 600 });
  document = window.document;
});
after(async () => {
  await window.happyDOM.close();
});

function stage() {
  const container = document.createElement("div");
  const world = document.createElement("div");
  container.append(world);
  document.body.append(container);
  // happy-dom has no layout: give the container a known rect.
  container.getBoundingClientRect = () => ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50 });
  return { container, world };
}

// happy-dom's WheelEvent drops modifier keys and client coordinates from its
// init dictionary (real browsers keep them), so copy any field it lost.
const wheel = (target, init) => {
  const event = new window.WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  const full = { ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...init };
  for (const [key, value] of Object.entries(full)) if (event[key] !== value) Object.defineProperty(event, key, { value });
  return target.dispatchEvent(event);
};
const pointer = (target, type, init) => target.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init }));

test("the transform and grid custom properties follow the viewport", () => {
  const { container, world } = stage();
  const vp = createViewport();
  const { detach } = attachViewport(vp, { container, world });
  vp.set({ x: 10, y: 20, zoom: 2 });
  assert.equal(world.style.transform, "translate(10px, 20px) scale(2)");
  assert.equal(container.style.getPropertyValue("--patchbay-zoom"), "2");
  detach();
});

test("a plain wheel pans; a ctrl wheel zooms about the cursor", () => {
  const { container, world } = stage();
  const vp = createViewport();
  const { detach, coordinates } = attachViewport(vp, { container, world });
  wheel(container, { deltaX: 10, deltaY: 30 });
  assert.deepEqual([vp.x, vp.y], [-10, -30]);
  const before = coordinates.toWorld(400, 300);
  wheel(container, { deltaY: -100, ctrlKey: true, clientX: 400, clientY: 300 });
  assert.ok(vp.zoom > 1);
  const after = coordinates.toWorld(400, 300);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9, "point under cursor stays put");
  detach();
});

test("a pinch (Ctrl+wheel) zooms under either wheel policy; ⌘ flips the policy; rates match", () => {
  const { container, world } = stage();
  const vp = createViewport();
  const { detach } = attachViewport(vp, { container, world, wheel: "zoom" });
  wheel(container, { deltaY: -20, ctrlKey: true, clientX: 400, clientY: 300 });
  const afterPinch = vp.zoom;
  assert.ok(afterPinch > 1, "pinch zooms under wheel: zoom");
  wheel(container, { deltaY: 30, metaKey: true });
  assert.equal(vp.zoom, afterPinch, "⌘ flips zoom policy to pan");
  assert.equal(vp.y, vp.get().y);
  detach();
  const a = createViewport();
  const b = createViewport();
  const da = attachViewport(a, { container, world });
  wheel(container, { deltaY: -100, ctrlKey: true, clientX: 400, clientY: 300 });
  da.detach();
  const db = attachViewport(b, { container, world });
  wheel(container, { deltaY: -100, metaKey: true, clientX: 400, clientY: 300 });
  db.detach();
  assert.ok(Math.abs(a.zoom - b.zoom) < 1e-12, "Ctrl and ⌘ zoom at the same rate");
});

test("dragging the empty canvas pans; dragging content does not", () => {
  const { container, world } = stage();
  const card = document.createElement("div");
  world.append(card);
  const vp = createViewport();
  const { detach } = attachViewport(vp, { container, world });
  pointer(card, "pointerdown", { clientX: 0, clientY: 0 });
  pointer(card, "pointermove", { clientX: 50, clientY: 50 });
  assert.deepEqual([vp.x, vp.y], [0, 0], "content drag isn't a pan");
  pointer(card, "pointerup", {});
  pointer(world, "pointerdown", { clientX: 0, clientY: 0 });
  pointer(container, "pointermove", { clientX: 40, clientY: 25 });
  pointer(container, "pointerup", {});
  assert.deepEqual([vp.x, vp.y], [40, 25]);
  const svgLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgLayer.setAttribute("class", "patchbay-wires");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svgLayer.append(path);
  world.append(svgLayer);
  pointer(path, "pointerdown", { clientX: 0, clientY: 0 });
  pointer(container, "pointermove", { clientX: 10, clientY: 0 });
  pointer(container, "pointerup", {});
  assert.deepEqual([vp.x, vp.y], [50, 25], "a drag that starts on a wire pans too");
  detach();
});

test("coordinates convert client pixels to world units through pan and zoom", () => {
  const { container, world } = stage();
  const vp = createViewport({ x: 20, y: 10, zoom: 2 });
  const { coordinates, detach } = attachViewport(vp, { container, world });
  // client (100+20, 50+10) is container-local (20, 10) = world origin
  assert.deepEqual(coordinates.toWorld(120, 60), { x: 0, y: 0 });
  assert.deepEqual(coordinates.toStage(140, 80), { x: 10, y: 10 });
  assert.equal(coordinates.scale(), 2);
  detach();
});

test("keyboard zoom and pan act only when the container has focus", () => {
  const { container, world } = stage();
  container.tabIndex = 0;
  const vp = createViewport();
  const { detach } = attachViewport(vp, { container, world });
  container.dispatchEvent(new window.KeyboardEvent("keydown", { key: "+", bubbles: true }));
  assert.ok(vp.zoom > 1);
  container.dispatchEvent(new window.KeyboardEvent("keydown", { key: "0", bubbles: true }));
  assert.equal(vp.zoom, 1);
  document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key: "+", bubbles: true }));
  assert.equal(vp.zoom, 1, "keys elsewhere on the page are ignored");
  detach();
});

test("content marked data-patchbay-ignore keeps its own wheel and drag gestures", () => {
  const { container, world } = stage();
  const pane = document.createElement("div");
  pane.setAttribute("data-patchbay-ignore", "");
  const canvas = document.createElement("canvas");
  pane.append(canvas);
  world.append(pane);
  const vp = createViewport();
  const { detach } = attachViewport(vp, { container, world, panOnDrag: () => true });
  wheel(canvas, { deltaY: 30 });
  pointer(canvas, "pointerdown", { clientX: 0, clientY: 0 });
  pointer(canvas, "pointermove", { clientX: 50, clientY: 50 });
  assert.deepEqual(vp.get(), { x: 0, y: 0, zoom: 1 });
  wheel(world, { deltaY: 30 });
  assert.equal(vp.y, -30, "outside the marked element the canvas still pans");
  detach();
});

test("detach stops listening", () => {
  const { container, world } = stage();
  const vp = createViewport();
  const { detach } = attachViewport(vp, { container, world });
  detach();
  wheel(container, { deltaY: 30 });
  assert.equal(vp.y, 0);
});

test("wires draw paths from resolved endpoints, hide unresolvable ones, and retain prunes", () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  const ports = { a: { x: 0, y: 0 }, b: { x: 100, y: 50 } };
  const wires = createWires({ svg, resolve: (id) => ports[id], schedule: (fn) => fn() });
  wires.set("ab", { from: "a", to: "b", className: "live", title: "a → b" });
  wires.set("ax", { from: "a", to: "missing" });
  assert.match(wires.element("ab").getAttribute("d"), /^M 0 0 C/);
  assert.match(wires.element("ab").getAttribute("class"), /patchbay-wire live/);
  assert.equal(wires.element("ab").querySelector("title").textContent, "a → b");
  assert.equal(wires.element("ax").getAttribute("visibility"), "hidden");
  ports.b = { x: 300, y: 50 };
  wires.schedule();
  assert.match(wires.element("ab").getAttribute("d"), /300 50$/);
  wires.retain(["ab"]);
  assert.deepEqual(wires.ids(), ["ab"]);
  assert.equal(svg.querySelectorAll("path").length, 1);
});

test("connectDrag follows the pointer, connects on a target, drops on empty space, cancels on Escape", () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.append(svg);
  const toWorld = (x, y) => ({ x, y });
  const results = [];
  const start = new window.PointerEvent("pointerdown", { pointerId: 7, clientX: 0, clientY: 0 });

  connectDrag({ svg, from: { x: 0, y: 0 }, event: start, toWorld, hitTest: (x) => (x > 100 ? "target" : undefined), onConnect: (t, p) => results.push(["connect", t, p.x]), onDrop: (p) => results.push(["drop", p.x]) });
  assert.equal(svg.querySelectorAll("path").length, 1, "a pending wire is drawn");
  document.dispatchEvent(new window.PointerEvent("pointermove", { pointerId: 7, clientX: 150, clientY: 0 }));
  document.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 7, clientX: 150, clientY: 0 }));
  assert.equal(svg.querySelectorAll("path").length, 0, "the pending wire is removed");

  connectDrag({ svg, from: { x: 0, y: 0 }, event: start, toWorld, hitTest: () => undefined, onDrop: (p) => results.push(["drop", p.x]) });
  document.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 7, clientX: 40, clientY: 0 }));

  connectDrag({ svg, from: { x: 0, y: 0 }, event: start, toWorld, onCancel: () => results.push(["cancel"]) });
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert.deepEqual(results, [["connect", "target", 150], ["drop", 40], ["cancel"]]);
});

test("anchorOf measures an element's side in world units", () => {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left: 10, top: 20, right: 110, bottom: 60, width: 100, height: 40 });
  const halfZoom = (x, y) => ({ x: x / 2, y: y / 2 });
  assert.deepEqual(anchorOf(el, halfZoom, { side: "right" }), { x: 55, y: 20 });
  assert.deepEqual(anchorOf(el, halfZoom, { side: "left", offset: 10 }), { x: 5, y: 25 });
});
