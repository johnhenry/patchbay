/**
 * A pannable, zoomable viewport over an unbounded 2D "world".
 *
 * `createViewport()` is pure state and math (no DOM): screen <-> world
 * conversion, zoom about a point, panning, fitting a box. `attachViewport()`
 * wires it to a container element (wheel, pinch, drag-to-pan, keyboard) and
 * applies the transform to a "world" element.
 *
 * Coordinates: "screen" points are relative to the container's top-left in
 * CSS pixels; "world" points are in the world element's own unscaled units.
 *   screen = world * zoom + (x, y)        world = (screen - (x, y)) / zoom
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {{ x?: number, y?: number, zoom?: number, minZoom?: number, maxZoom?: number }} [init]
 */
export function createViewport({ x = 0, y = 0, zoom = 1, minZoom = 0.1, maxZoom = 4 } = {}) {
  if (!(minZoom > 0) || !(maxZoom >= minZoom)) throw new RangeError("createViewport: need 0 < minZoom <= maxZoom");
  const state = { x, y, zoom: clamp(zoom, minZoom, maxZoom) };
  const listeners = new Set();
  const emit = () => {
    const snapshot = { ...state };
    for (const fn of listeners) fn(snapshot);
  };

  const vp = {
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    get zoom() {
      return state.zoom;
    },
    minZoom,
    maxZoom,

    /** Current `{ x, y, zoom }` (a copy). */
    get() {
      return { ...state };
    },

    /** Replace any of x / y / zoom. Zoom is clamped. */
    set(next = {}) {
      const nx = next.x ?? state.x;
      const ny = next.y ?? state.y;
      const nz = clamp(next.zoom ?? state.zoom, minZoom, maxZoom);
      if (![nx, ny, nz].every(Number.isFinite)) throw new RangeError("viewport.set: non-finite value");
      if (nx === state.x && ny === state.y && nz === state.zoom) return vp;
      Object.assign(state, { x: nx, y: ny, zoom: nz });
      emit();
      return vp;
    },

    /** Move the world by a screen-space delta (dragging the canvas right moves content right). */
    panBy(dx, dy) {
      return vp.set({ x: state.x + dx, y: state.y + dy });
    },

    /** Zoom by `factor` keeping the screen point `at` fixed over the same world point. */
    zoomAt(at, factor) {
      const nz = clamp(state.zoom * factor, minZoom, maxZoom);
      const world = vp.toWorld(at);
      return vp.set({ zoom: nz, x: at.x - world.x * nz, y: at.y - world.y * nz });
    },

    /** Set an absolute zoom keeping the screen point `at` fixed. */
    zoomTo(zoom, at = { x: 0, y: 0 }) {
      return vp.zoomAt(at, clamp(zoom, minZoom, maxZoom) / state.zoom);
    },

    toWorld({ x: sx, y: sy }) {
      return { x: (sx - state.x) / state.zoom, y: (sy - state.y) / state.zoom };
    },
    toScreen({ x: wx, y: wy }) {
      return { x: wx * state.zoom + state.x, y: wy * state.zoom + state.y };
    },

    /** The world-space rectangle visible in a container of `size`. */
    visibleRect({ width, height }) {
      const tl = vp.toWorld({ x: 0, y: 0 });
      return { x: tl.x, y: tl.y, width: width / state.zoom, height: height / state.zoom };
    },

    /** Center (and optionally zoom) so the world `rect` fits inside a container of `size`. */
    fit(rect, size, { padding = 24, maxZoom: cap = 1 } = {}) {
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const zoom = clamp(Math.min((size.width - padding * 2) / w, (size.height - padding * 2) / h, cap), minZoom, maxZoom);
      return vp.set({
        zoom,
        x: size.width / 2 - (rect.x + w / 2) * zoom,
        y: size.height / 2 - (rect.y + h / 2) * zoom,
      });
    },

    /** Center the world point `point` in a container of `size`, keeping the zoom. */
    centerOn(point, size) {
      return vp.set({ x: size.width / 2 - point.x * state.zoom, y: size.height / 2 - point.y * state.zoom });
    },

    /** CSS transform for the world element (with `transform-origin: 0 0`). */
    transform() {
      return `translate(${state.x}px, ${state.y}px) scale(${state.zoom})`;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return vp;
}

/** Bounding box of world rectangles (`{ x, y, width, height }`), or `undefined` for none. */
export function boundsOf(rects) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : undefined;
}

/**
 * Wire a viewport to the DOM.
 *
 * - wheel pans and ⌘+wheel zooms (`wheel: "zoom"` swaps those two); Ctrl+wheel
 *   and trackpad pinch (which browsers report as Ctrl+wheel) always zoom, about
 *   the cursor, at the same rate as ⌘+wheel.
 * - dragging pans when `panOnDrag(event)` says so: by default the middle
 *   button, Space held, or any primary drag that starts on empty canvas (the
 *   container, the world element, or the wire layer), not on content.
 * - touch: two fingers pinch-zoom about their midpoint and pan with it; the
 *   second finger cancels a one-finger pan. Touch on `data-patchbay-ignore`
 *   content is left alone. Mouse and one-finger behaviour are unchanged.
 * - keyboard (when the container has focus): `+`/`-` zoom, `0` resets zoom,
 *   arrows pan.
 * - anything inside an element with `data-patchbay-ignore` keeps its own
 *   wheel and drag gestures (scrollable output, an interactive animation).
 * - applies `viewport.transform()` to `world` and sets `--patchbay-x`,
 *   `--patchbay-y`, `--patchbay-zoom` on the container (for grid backgrounds).
 *
 * Returns `{ coordinates, detach }`. `coordinates` converts client (page)
 * pointer positions to world units: `{ toWorld(clientX, clientY), toStage(clientX, clientY), scale() }`
 * (`toStage` is an alias for libraries that call the world a "stage").
 *
 * @param {ReturnType<typeof createViewport>} viewport
 * @param {{ container: HTMLElement, world?: HTMLElement, wheel?: "pan" | "zoom",
 *   wheelZoomSpeed?: number, panOnDrag?: (event: PointerEvent) => boolean, keyboard?: boolean }} options
 */
export function attachViewport(viewport, { container, world, wheel = "pan", wheelZoomSpeed = 0.006, panOnDrag, keyboard = true } = {}) {
  if (!container) throw new TypeError("attachViewport: `container` is required");
  const doc = container.ownerDocument;
  let spaceDown = false;
  let drag = null;

  const local = (clientX, clientY) => {
    const r = container.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const apply = () => {
    if (world) {
      world.style.transformOrigin = "0 0";
      world.style.transform = viewport.transform();
    }
    container.style.setProperty("--patchbay-x", `${viewport.x}px`);
    container.style.setProperty("--patchbay-y", `${viewport.y}px`);
    container.style.setProperty("--patchbay-zoom", String(viewport.zoom));
  };
  apply();
  // Touch gestures are ours: without this the browser pans/zooms the page and
  // cancels the pointer stream. (A scrollable data-patchbay-ignore child is its
  // own scroll container, so it keeps touch scrolling.)
  const priorTouchAction = container.style.touchAction;
  container.style.touchAction = "none";
  const unsubscribe = viewport.subscribe(apply);

  // Empty canvas: the stage, the world, or the wire layer (wires are background).
  const onBackground = (target) =>
    target === container || target === world || Boolean(target?.closest?.(".patchbay-wires") && container.contains(target));
  const defaultPanOnDrag = (event) => event.button === 1 || (event.button === 0 && (spaceDown || onBackground(event.target)));
  const shouldPan = panOnDrag ?? defaultPanOnDrag;

  // Content that handles its own gestures (a scrollable panel, an interactive
  // ecmanim camera, a map) opts out with data-patchbay-ignore on any ancestor.
  const ignored = (event) => {
    const target = event.target;
    const hit = target && typeof target.closest === "function" ? target.closest("[data-patchbay-ignore]") : null;
    return Boolean(hit && container.contains(hit));
  };

  const onWheel = (event) => {
    if (ignored(event)) return;
    // Ctrl+wheel always zooms: it is also how browsers report a trackpad
    // pinch, and a pinch should zoom whatever the wheel policy. ⌘ flips the
    // policy for a plain wheel.
    const zoomGesture = Boolean(event.ctrlKey) || Boolean(event.metaKey) !== (wheel === "zoom");
    event.preventDefault();
    if (zoomGesture) {
      // deltaMode 1 = lines; normalize roughly to pixels.
      // A mouse-wheel notch reports ~100px while a trackpad pinch reports a
      // few px per event; capping the per-event delta keeps one notch to a
      // modest step (about 1.35x) without slowing pinch. Same rate for every
      // modifier.
      const dy = Math.max(-50, Math.min(50, event.deltaY * (event.deltaMode === 1 ? 16 : 1)));
      viewport.zoomAt(local(event.clientX, event.clientY), Math.exp(-dy * wheelZoomSpeed));
    } else {
      const scale = event.deltaMode === 1 ? 16 : 1;
      viewport.panBy(-event.deltaX * scale, -event.deltaY * scale);
    }
  };

  // Touch: up to two active touch pointers make a pinch. `pinch` holds the
  // previous distance and midpoint (container-local) between moves.
  const touches = new Map();
  let pinch = null;
  const endDrag = (id) => {
    container.releasePointerCapture?.(id);
    delete container.dataset.patchbayPanning;
    drag = null;
  };
  const pinchState = () => {
    const [a, b] = [...touches.values()];
    const p = local(a.x, a.y);
    const q = local(b.x, b.y);
    return { dist: Math.hypot(q.x - p.x, q.y - p.y), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "touch" && !ignored(event) && touches.size < 2) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        // The second finger turns a one-finger pan into a pinch.
        if (drag) endDrag(drag.id);
        for (const id of touches.keys()) container.setPointerCapture?.(id);
        pinch = pinchState();
        container.dataset.patchbayPanning = "";
        event.preventDefault();
        return;
      }
    }
    if (drag || pinch || ignored(event) || !shouldPan(event)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    container.setPointerCapture?.(event.pointerId);
    container.dataset.patchbayPanning = "";
    event.preventDefault();
  };
  const onPointerMove = (event) => {
    const t = touches.get(event.pointerId);
    if (t) {
      t.x = event.clientX;
      t.y = event.clientY;
    }
    if (t && pinch) {
      const now = pinchState();
      // Pan by the midpoint's travel first, then zoom about the new midpoint:
      // the world point that was under the old midpoint ends up under the new one.
      viewport.panBy(now.mid.x - pinch.mid.x, now.mid.y - pinch.mid.y);
      if (pinch.dist > 0 && now.dist > 0) viewport.zoomAt(now.mid, now.dist / pinch.dist);
      pinch = now;
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    viewport.panBy(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const onPointerUp = (event) => {
    if (touches.delete(event.pointerId) && pinch) {
      // Either finger lifting ends the pinch; the other does not resume a pan.
      container.releasePointerCapture?.(event.pointerId);
      for (const id of touches.keys()) container.releasePointerCapture?.(id);
      delete container.dataset.patchbayPanning;
      pinch = null;
      return;
    }
    if (!drag || event.pointerId !== drag.id) return;
    endDrag(event.pointerId);
  };

  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const onKeyDown = (event) => {
    if (event.key === " " && !editable(event.target)) {
      spaceDown = true;
      container.dataset.patchbaySpace = "";
    }
    if (!keyboard || event.target !== container) return;
    const r = container.getBoundingClientRect();
    const center = { x: r.width / 2, y: r.height / 2 };
    const step = event.shiftKey ? 200 : 50;
    const actions = {
      "+": () => viewport.zoomAt(center, 1.2),
      "=": () => viewport.zoomAt(center, 1.2),
      "-": () => viewport.zoomAt(center, 1 / 1.2),
      "0": () => viewport.zoomTo(1, center),
      ArrowLeft: () => viewport.panBy(step, 0),
      ArrowRight: () => viewport.panBy(-step, 0),
      ArrowUp: () => viewport.panBy(0, step),
      ArrowDown: () => viewport.panBy(0, -step),
    };
    const action = actions[event.key];
    if (action && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      action();
    }
  };
  const onKeyUp = (event) => {
    if (event.key === " ") {
      spaceDown = false;
      delete container.dataset.patchbaySpace;
    }
  };

  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);
  doc.addEventListener("keydown", onKeyDown);
  doc.addEventListener("keyup", onKeyUp);

  const toWorld = (clientX, clientY) => viewport.toWorld(local(clientX, clientY));
  const coordinates = { toWorld, toStage: toWorld, scale: () => viewport.zoom, toLocal: local };

  return {
    coordinates,
    detach() {
      unsubscribe();
      container.style.touchAction = priorTouchAction;
      touches.clear();
      pinch = null;
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
    },
  };
}
