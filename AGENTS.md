# Agent playbook

`@johnhenry/patchbay` -- a pannable, zoomable canvas (viewport math + gestures) and wires between things on it. Single package, Node >= 26, `node:test` (`npm test`; DOM tests under happy-dom), ships source; no build step. `createViewport()` and `wirePath()` must stay DOM-free; everything else is browser code.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm test` -- `node --test test/` (math + happy-dom DOM tests), then `examples/01-03`. 0 failed, 0 skipped.
2. Open `examples/04-cards-and-wires-in-a-browser/` in a real browser (`npx serve .`) after any gesture change: drag a card, drag a port to a card and to empty space, wheel, Ctrl+wheel, scroll the list in card 1. happy-dom has no layout and no real wheel deltas.
3. `npm pack --dry-run` -- `src/` (including `patchbay.css`), `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`.
4. A genuinely fresh clone: `git clone . /tmp/patchbay-verifyN && cd $_ && npm ci && npm test`.

CI (`.github/workflows/ci.yml`) calls `johnhenry/workflows`' reusable `ci.yml@v1` with `npm test`, plus `workflow-lint`.

## Repo-specific gotchas

- **happy-dom's `WheelEvent` drops `ctrlKey`, `metaKey`, `clientX` and `clientY` from its init dictionary.** The `wheel()` helper in `test/dom.test.mjs` copies them back; don't "simplify" it. The same gap once made a missing `ctrlKey` read as a zoom gesture, which is why the handler coerces modifiers with `Boolean()`.
- **Mouse-wheel and trackpad deltas differ by ~30x.** Zoom steps are capped per event; test a real mouse notch and a real pinch after changing `wheelZoomSpeed` or the cap.
- **Every conversion goes through the container's client rect.** Code that subtracts `getBoundingClientRect()` of anything else breaks when the stage isn't at the page origin.

## Definition of done

- A regression test for any bug fixed (headless where possible, plus a manual step in example 04 for gesture feel).
- Limitations in the README's Honest limitations, not only in issues.
- `CHANGELOG.md` cites the commit/PR; `examples/README.md` lists every example; `src/*.d.ts` match the runtime API.

## Releases

`main` is the release branch. Bump `version` and add the dated `CHANGELOG.md` entry in a PR; merging publishes through `.github/workflows/publish.yml` (npm trusted publishing, idempotent `npm view` guard), which then creates the `v<version>` tag and GitHub Release. Don't rename `publish.yml`: npm trusted publishing is bound to that filename.
