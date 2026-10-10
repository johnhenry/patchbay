export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface ViewportState { x: number; y: number; zoom: number }

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  get(): ViewportState;
  set(next: Partial<ViewportState>): Viewport;
  panBy(dx: number, dy: number): Viewport;
  zoomAt(at: Point, factor: number): Viewport;
  zoomTo(zoom: number, at?: Point): Viewport;
  toWorld(screen: Point): Point;
  toScreen(world: Point): Point;
  visibleRect(size: Size): Rect;
  fit(rect: Rect, size: Size, options?: { padding?: number; maxZoom?: number }): Viewport;
  centerOn(point: Point, size: Size): Viewport;
  transform(): string;
  subscribe(fn: (state: ViewportState) => void): () => boolean;
}

export function createViewport(init?: Partial<ViewportState> & { minZoom?: number; maxZoom?: number }): Viewport;
export function boundsOf(rects: Iterable<Rect>): Rect | undefined;

export interface Coordinates {
  /** Client (page) pixels to world units. */
  toWorld(clientX: number, clientY: number): Point;
  /** Alias of `toWorld`, for libraries that call the world a "stage". */
  toStage(clientX: number, clientY: number): Point;
  /** Current zoom: world units per screen pixel is `1 / scale()`. */
  scale(): number;
  /** Client pixels to container-local screen pixels. */
  toLocal(clientX: number, clientY: number): Point;
}

export function attachViewport(
  viewport: Viewport,
  options: {
    container: HTMLElement;
    world?: HTMLElement;
    wheel?: "pan" | "zoom";
    wheelZoomSpeed?: number;
    panOnDrag?: (event: PointerEvent) => boolean;
    keyboard?: boolean;
  },
): { coordinates: Coordinates; detach(): void };

export type Direction = "right" | "left" | "up" | "down";
export interface WireShape { from?: Direction; to?: Direction; curvature?: number; minHandle?: number }

export function wirePath(a: Point, b: Point, shape?: WireShape): string;
export function anchorOf(
  element: Element,
  toWorld: (clientX: number, clientY: number) => Point,
  options?: { side?: "right" | "left" | "top" | "bottom" | "center"; offset?: number },
): Point;

export interface Wires<E = unknown> {
  set(id: string, options: { from: E; to: E; className?: string; shape?: WireShape; title?: string }): Wires<E>;
  delete(id: string): Wires<E>;
  has(id: string): boolean;
  ids(): string[];
  element(id: string): SVGPathElement | undefined;
  retain(keep: Iterable<string>): Wires<E>;
  update(): Wires<E>;
  schedule(): Wires<E>;
  clear(): Wires<E>;
}
export function createWires<E = Point>(options: {
  svg: SVGSVGElement;
  resolve?: (endpoint: E) => Point | undefined;
  schedule?: (fn: () => void) => void;
}): Wires<E>;

export function connectDrag<T = unknown>(options: {
  svg: SVGSVGElement;
  from: Point;
  event: PointerEvent;
  toWorld: (clientX: number, clientY: number) => Point;
  hitTest?: (clientX: number, clientY: number) => T | undefined;
  onConnect?: (target: T, point: Point) => void;
  onDrop?: (point: Point) => void;
  onCancel?: () => void;
  onHover?: (target: T | undefined) => void;
  shape?: WireShape;
  className?: string;
}): { cancel(): void };
