/**
 * Generates the battery-station marker icon used by the Battery Stations map.
 *
 *   node scripts/generate-station-icons.mjs
 *
 * Why a generator rather than committed art: this is a tiny white-on-
 * transparent glyph, and a script makes "nudge the stroke weight" a one-line
 * change instead of a round trip through a design tool. The PNG it writes IS
 * committed — this is here so it can be regenerated, not run at build time.
 *
 * One icon now, not three: status used to be a different glyph shape per
 * status (battery + check/!/cross) so it survived colour blindness and
 * greyscale screenshots without relying on the circle's fill colour alone.
 * The marker redesign dropped that in favour of a single bolt on a
 * status-coloured circle — simpler, matches the app's own charging-bolt
 * motif (BatteryCharging iconography used elsewhere), status now read
 * from the circle colour the same way a traffic light is.
 *
 * Rendered white so the marker layer can sit it on the status-coloured
 * circle without needing SDF tinting.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 96;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'map');

// --- tiny raster canvas -------------------------------------------------

const createCanvas = () => new Uint8Array(SIZE * SIZE * 4); // RGBA, all transparent

function plot(canvas, x, y, alpha = 255) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return;
    const i = (py * SIZE + px) * 4;
    // White, and keep the strongest alpha so overlapping strokes don't thin out.
    canvas[i] = 255;
    canvas[i + 1] = 255;
    canvas[i + 2] = 255;
    canvas[i + 3] = Math.max(canvas[i + 3], alpha);
}

/**
 * Fills a closed polygon (list of [x, y] vertices, in order) with a classic
 * scanline algorithm: for each row, find where the polygon's edges cross it,
 * sort those x's, and fill the spans between each pair.
 */
function fillPolygon(canvas, points) {
    const ys = points.map((p) => p[1]);
    const yMin = Math.max(0, Math.floor(Math.min(...ys)));
    const yMax = Math.min(SIZE - 1, Math.ceil(Math.max(...ys)));

    for (let y = yMin; y <= yMax; y++) {
        const scanY = y + 0.5;
        const xs = [];
        for (let i = 0; i < points.length; i++) {
            const [x0, y0] = points[i];
            const [x1, y1] = points[(i + 1) % points.length];
            if ((y0 <= scanY && y1 > scanY) || (y1 <= scanY && y0 > scanY)) {
                xs.push(x0 + ((scanY - y0) / (y1 - y0)) * (x1 - x0));
            }
        }
        xs.sort((a, b) => a - b);
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const xStart = Math.max(0, Math.round(xs[i]));
            const xEnd = Math.min(SIZE - 1, Math.round(xs[i + 1]));
            for (let x = xStart; x <= xEnd; x++) plot(canvas, x, y);
        }
    }
}

/**
 * A bold lightning bolt — the classic "Z with a flipped triangle on each
 * end" silhouette, drawn fat rather than thin since this renders at ~14px
 * on the map and a thin bolt disappears at that size.
 */
function drawBolt(canvas) {
    fillPolygon(canvas, [
        [54, 6],
        [24, 50],
        [42, 50],
        [30, 90],
        [72, 40],
        [52, 40],
    ]);
}

// --- PNG encoding -------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function encodePng(canvas) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // colour type: RGBA
    // 10..12 = compression/filter/interlace, all 0

    // One filter byte (0 = None) per scanline.
    const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
    for (let y = 0; y < SIZE; y++) {
        raw[y * (SIZE * 4 + 1)] = 0;
        Buffer.from(canvas.buffer, y * SIZE * 4, SIZE * 4)
            .copy(raw, y * (SIZE * 4 + 1) + 1);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

mkdirSync(OUT_DIR, { recursive: true });

// Retired per-status icons — one bolt now covers every status.
for (const stale of ['station-working.png', 'station-maintenance.png', 'station-not-working.png']) {
    const path = join(OUT_DIR, stale);
    if (existsSync(path)) rmSync(path);
}

const canvas = createCanvas();
drawBolt(canvas);
const file = join(OUT_DIR, 'station-bolt.png');
writeFileSync(file, encodePng(canvas));
console.log(`wrote ${file}`);
