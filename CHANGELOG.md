# Changelog

## 0.0.0 (2026-10-09)

First release. A new package, never published under another name.

- **`createViewport()`: pure pan/zoom state and math.** Screen/world conversion, `zoomAt` that keeps the point under the cursor fixed (even when clamped), `fit`, `centerOn`, `visibleRect`, `boundsOf`.
- **`attachViewport()`: gestures.** Wheel pans and Ctrl/⌘+wheel or trackpad pinch zooms about the cursor; empty-canvas, middle-button and Space drags pan; keyboard zoom and pan while focused; `data-patchbay-ignore` hands wheel and drag back to content that needs them (scrolling output, an interactive ecmanim camera). Returns a `coordinates` hook (`toWorld`, `toStage`, `scale`) for drag code and window managers. Two bugs were found in a real browser and in happy-dom before release and fixed: a missing `ctrlKey` was read as "zoom" (now coerced to a boolean), and one mouse-wheel notch with Ctrl zoomed 3.3x (the per-event delta is now capped).
- **Wires.** `wirePath()` cubic paths with directional handles, `createWires()` keyed SVG paths with frame-coalesced redraws, `connectDrag()` drag-to-connect with connect / drop-on-empty / cancel outcomes, `anchorOf()`.
- Optional `patchbay.css` with a world-locked dot grid and non-scaling wire strokes.
- Built for the miso spatial notebook.
