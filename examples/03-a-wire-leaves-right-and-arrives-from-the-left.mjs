// wirePath: a left-to-right patch cable, even when the target is behind the source.
import assert from "node:assert/strict";
import { wirePath } from "@johnhenry/patchbay";

const nums = (d) => d.match(/-?[\d.]+/g).map(Number);
const [ax, ay, c1x, c1y, c2x, c2y, bx, by] = nums(wirePath({ x: 400, y: 0 }, { x: 100, y: 80 }));
assert.deepEqual([ax, ay, bx, by], [400, 0, 100, 80]);
assert.ok(c1x > ax && c1y === ay, "leaves to the right");
assert.ok(c2x < bx && c2y === by, "arrives from the left, looping around");
console.log("ok:", wirePath({ x: 400, y: 0 }, { x: 100, y: 80 }));
