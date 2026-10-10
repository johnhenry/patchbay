/**
 * Wires between things on a canvas: SVG bezier paths between ports, kept in
 * world coordinates (so they live inside the same transformed element as the
 * things they connect), plus a drag-to-connect gesture.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const DIRECTIONS = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

/**
 * SVG path data for a cubic wire from `a` to `b`.
 * `from`/`to` are the directions the wire leaves `a` and enters `b`
 * (default: leaves rightward, enters from the left -- a left-to-right patch).
 */
export function wirePath(a, b, { from = "right", to = "left", curvature = 0.5, minHandle = 30 } = {}) {
  const da = DIRECTIONS[from] ?? DIRECTIONS.right;
  const dbIn = DIRECTIONS[to] ?? DIRECTIONS.left;
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const handle = Math.max(minHandle, dist * curvature);
  const c1 = { x: a.x + da.x * handle, y: a.y + da.y * handle };
  // `to: "left"` means the wire arrives at the left side, travelling rightward,
  // so the second control point sits to the left of b.
  const c2 = { x: b.x + dbIn.x * handle, y: b.y + dbIn.y * handle };
  const f = (n) => Math.round(n * 100) / 100;
  return `M ${f(a.x)} ${f(a.y)} C ${f(c1.x)} ${f(c1.y)}, ${f(c2.x)} ${f(c2.y)}, ${f(b.x)} ${f(b.y)}`;
}

/** A world-space point on a side of an element, measured from its screen rect through `toWorld(clientX, clientY)`. */
export function anchorOf(element, toWorld, { side = "right", offset = 0 } = {}) {
  const r = element.getBoundingClientRect();
  const points = {
    right: [r.right, r.top + r.height / 2 + offset],
    left: [r.left, r.top + r.height / 2 + offset],
    top: [r.left + r.width / 2 + offset, r.top],
    bottom: [r.left + r.width / 2 + offset, r.bottom],
    center: [r.left + r.width / 2, r.top + r.height / 2],
  };
  const [cx, cy] = points[side] ?? points.center;
  return toWorld(cx, cy);
}

/**
 * A set of wires drawn into an `<svg>` that lives in world space.
 *
 * `resolve(endpoint)` turns an endpoint into a world point: an endpoint is
 * either a point `{ x, y }` or anything your resolver understands (a port id,
 * an element). Return `undefined` to hide the wire (e.g. a port that isn't
 * rendered).
 *
 * @param {{ svg: SVGSVGElement, resolve?: (endpoint: unknown) => { x: number, y: number } | undefined,
 *   schedule?: (fn: () => void) => void }} options
 */
export function createWires({ svg, resolve = (p) => p, schedule = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((fn) => setTimeout(fn, 0)) }) {
  if (!svg) throw new TypeError("createWires: `svg` is required");
  const doc = svg.ownerDocument;
  const wires = new Map();
  let queued = false;

  const draw = (id) => {
    const wire = wires.get(id);
    const a = resolve(wire.from);
    const b = resolve(wire.to);
    if (!a || !b) {
      wire.path.setAttribute("visibility", "hidden");
      return;
    }
    wire.path.removeAttribute("visibility");
    wire.path.setAttribute("d", wirePath(a, b, wire.shape));
  };

  const api = {
    /** Add or replace a wire. `options`: `{ from, to, className, shape: { from, to, curvature }, title }`. */
    set(id, { from, to, className = "", shape = {}, title } = {}) {
      let wire = wires.get(id);
      if (!wire) {
        const path = doc.createElementNS(SVG_NS, "path");
        path.dataset.wire = id;
        svg.append(path);
        wire = { path };
        wires.set(id, wire);
      }
      Object.assign(wire, { from, to, shape });
      wire.path.setAttribute("class", `patchbay-wire ${className}`.trim());
      wire.path.replaceChildren();
      if (title) {
        const t = doc.createElementNS(SVG_NS, "title");
        t.textContent = title;
        wire.path.append(t);
      }
      draw(id);
      return api;
    },
    delete(id) {
      wires.get(id)?.path.remove();
      wires.delete(id);
      return api;
    },
    has: (id) => wires.has(id),
    ids: () => [...wires.keys()],
    /** The `<path>` for a wire, for styling or events. */
    element: (id) => wires.get(id)?.path,
    /** Keep only the wires whose ids are in `keep`. */
    retain(keep) {
      const set = new Set(keep);
      for (const id of [...wires.keys()]) if (!set.has(id)) api.delete(id);
      return api;
    },
    /** Recompute every path now (call after things moved). */
    update() {
      for (const id of wires.keys()) draw(id);
      return api;
    },
    /** Recompute on the next frame, coalescing many calls into one. */
    schedule() {
      if (queued) return api;
      queued = true;
      schedule(() => {
        queued = false;
        api.update();
      });
      return api;
    },
    clear() {
      for (const id of [...wires.keys()]) api.delete(id);
      return api;
    },
  };
  return api;
}

/**
 * Drag a temporary wire from `from` (a world point) following the pointer,
 * then report where it was dropped.
 *
 * `hitTest(clientX, clientY)` returns a drop target (anything truthy) or
 * `undefined`. On release, `onConnect(target, worldPoint)` runs when there was
 * a target, otherwise `onDrop(worldPoint)` (e.g. "create a new node here");
 * Escape or pointercancel calls `onCancel()`.
 *
 * @param {{ svg: SVGSVGElement, from: { x: number, y: number }, event: PointerEvent,
 *   toWorld: (clientX: number, clientY: number) => { x: number, y: number },
 *   hitTest?: (clientX: number, clientY: number) => unknown,
 *   onConnect?: (target: unknown, point: { x: number, y: number }) => void,
 *   onDrop?: (point: { x: number, y: number }) => void, onCancel?: () => void,
 *   onHover?: (target: unknown) => void, shape?: object, className?: string }} options
 */
export function connectDrag({ svg, from, event, toWorld, hitTest = () => undefined, onConnect, onDrop, onCancel, onHover, shape, className = "patchbay-wire patchbay-wire-pending" }) {
  const doc = svg.ownerDocument;
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("class", className);
  svg.append(path);
  const pointerId = event.pointerId;
  let hovered;
  let done = false;

  const move = (clientX, clientY) => {
    const p = toWorld(clientX, clientY);
    path.setAttribute("d", wirePath(from, p, shape));
    const target = hitTest(clientX, clientY);
    if (target !== hovered) {
      hovered = target;
      onHover?.(target);
    }
    return p;
  };
  move(event.clientX, event.clientY);

  const finish = () => {
    done = true;
    path.remove();
    doc.removeEventListener("pointermove", onMove, true);
    doc.removeEventListener("pointerup", onUp, true);
    doc.removeEventListener("pointercancel", onCancelEvent, true);
    doc.removeEventListener("keydown", onKey, true);
    if (hovered !== undefined) onHover?.(undefined);
  };
  const onMove = (e) => {
    if (e.pointerId === pointerId) move(e.clientX, e.clientY);
  };
  const onUp = (e) => {
    if (e.pointerId !== pointerId) return;
    const p = move(e.clientX, e.clientY);
    const target = hitTest(e.clientX, e.clientY);
    finish();
    if (target !== undefined && target !== null && target !== false) onConnect?.(target, p);
    else onDrop?.(p);
  };
  const onCancelEvent = (e) => {
    if (e.pointerId !== pointerId) return;
    finish();
    onCancel?.();
  };
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    finish();
    onCancel?.();
  };
  doc.addEventListener("pointermove", onMove, true);
  doc.addEventListener("pointerup", onUp, true);
  doc.addEventListener("pointercancel", onCancelEvent, true);
  doc.addEventListener("keydown", onKey, true);
  return {
    cancel() {
      if (done) return;
      finish();
      onCancel?.();
    },
  };
}
