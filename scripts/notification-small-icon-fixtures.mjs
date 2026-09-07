import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import vm from "node:vm";

// Decode our RGBA PNG without adding a production image-processing dependency.
const png = readFileSync(new URL("../public/brand/addi-notification-badge.png", import.meta.url));
assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
let width, height; const chunks = [];
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset), type = png.toString("ascii", offset + 4, offset + 8);
  const data = png.subarray(offset + 8, offset + 8 + length);
  if (type === "IHDR") {
    width = data.readUInt32BE(0); height = data.readUInt32BE(4);
    assert.equal(data[8], 8); assert.equal(data[9], 6); assert.equal(data[12], 0);
  }
  if (type === "IDAT") chunks.push(data);
  offset += length + 12;
}
assert.equal(width, 96); assert.equal(height, 96);
const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4, pixels = Buffer.alloc(stride * height);
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)]; assert.ok(filter <= 4);
  for (let x = 0; x < stride; x++) {
    const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0;
    const b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
    const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
    pixels[i] = (raw[y * (stride + 1) + 1 + x] + prediction) & 255;
  }
}
let transparent = 0, opaque = 0;
const alpha = (x, y) => pixels[(y * width + x) * 4 + 3];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4, a = pixels[i + 3];
  if (!a) transparent++;
  if (a === 255) opaque++;
  if (a) assert.deepEqual([...pixels.subarray(i, i + 3)], [255, 255, 255]);
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) assert.equal(a, 0);
}
assert.ok(transparent > width * height / 2); assert.ok(opaque > 1000);
assert.equal(alpha(31, 48), 0, "A counter must be transparent");
assert.equal(alpha(74, 48), 0, "D counter must be transparent");
assert.equal(alpha(60, 48), 255, "D stem must be opaque");

const handlers = new Map(), shown = []; let done;
const self = {
  addEventListener: (name, fn) => handlers.set(name, fn),
  clients: { matchAll: async () => [] },
  registration: { showNotification: async (...args) => { shown.push(args); } },
};
vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self });
handlers.get("push")({ data: { json: () => ({ title: "fixture", body: "synthetic", route: "/", notificationId: "test" }) },
  waitUntil: (promise) => { done = promise; } });
await done;
assert.equal(shown.length, 1);
assert.equal(shown[0][1].badge, "/brand/addi-notification-badge.png");
assert.equal(shown[0][1].icon, "/icon.png", "large/app icon is unchanged");
assert.equal(shown[0][1].data.route, "/");
console.log(`PASS transparent white AD badge: ${transparent} transparent / ${opaque} opaque pixels; mock showNotification=1; real Push=0`);
