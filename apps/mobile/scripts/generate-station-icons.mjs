/**
 * Generates the battery-station marker icons used by the Battery Stations
 * map — a location-pin silhouette and a bolt glyph, composed together as two
 * symbol layers (see BatteryStationMarker.tsx / BatteryStationMapView.web.tsx):
 *
 *   node scripts/generate-station-icons.mjs
 *
 * Why a generator rather than committed art: these are tiny monochrome
 * glyphs, and a script makes "nudge the stroke weight" a one-line change
 * instead of a round trip through a design tool. The PNGs it writes ARE
 * committed — this is here so they can be regenerated, not run at build time.
 *
 *   station-pin.png   a solid white teardrop, registered with `sdf: true` so
 *                      the map layer can tint it per-status (green/amber/red)
 *                      via icon-color at render time — one asset, any colour,
 *                      rather than baking a separate PNG per status.
 *   station-bolt.png   the lightning bolt, rendered plain white (NOT sdf —
 *                      it must stay white regardless of the pin's colour)
 *                      and layered on top of the pin's head.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'map');

// --- tiny raster canvas -------------------------------------------------

function createCanvas(width, height) {
    return { width, height, data: new Uint8Array(width * height * 4) }; // RGBA, all transparent
}

function plot(canvas, x, y, alpha = 255) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
    const i = (py * canvas.width + px) * 4;
    // White, and keep the strongest alpha so overlapping strokes don't thin out.
    canvas.data[i] = 255;
    canvas.data[i + 1] = 255;
    canvas.data[i + 2] = 255;
    canvas.data[i + 3] = Math.max(canvas.data[i + 3], alpha);
}

function fillCircle(canvas, cx, cy, r) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) plot(canvas, x, y);
        }
    }
}

/**
 * Fills a closed polygon (list of [x, y] vertices, in order) with a classic
 * scanline algorithm: for each row, find where the polygon's edges cross it,
 * sort those x's, and fill the spans between each pair.
 */
function fillPolygon(canvas, points) {
    const ys = points.map((p) => p[1]);
    const yMin = Math.max(0, Math.floor(Math.min(...ys)));
    const yMax = Math.min(canvas.height - 1, Math.ceil(Math.max(...ys)));

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
            const xEnd = Math.min(canvas.width - 1, Math.round(xs[i + 1]));
            for (let x = xStart; x <= xEnd; x++) plot(canvas, x, y);
        }
    }
}

/**
 * The classic map-pin silhouette: a round head (circle) with a triangular
 * tail tapering to a point, the two composited together. Union of a circle
 * and a triangle rather than one smooth bezier outline — this generator has
 * no curve-fill primitive, and at the ~20px the map actually renders this
 * icon, the straight tangent seam disappears into the downsample anyway.
 */
function drawPin(canvas) {
    const cx = 48;
    const cy = 44;
    const r = 34;
    fillCircle(canvas, cx, cy, r);
    fillPolygon(canvas, [
        [cx - 26, cy + 20],
        [cx + 26, cy + 20],
        [cx, 124],
    ]);
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
    const { width, height, data } = canvas;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // colour type: RGBA
    // 10..12 = compression/filter/interlace, all 0

    // One filter byte (0 = None) per scanline.
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        Buffer.from(data.buffer, y * width * 4, width * 4)
            .copy(raw, y * (width * 4 + 1) + 1);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function writeIcon(name, width, height, draw) {
    const canvas = createCanvas(width, height);
    draw(canvas);
    const file = join(OUT_DIR, `${name}.png`);
    writeFileSync(file, encodePng(canvas));
    console.log(`wrote ${file}`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeIcon('station-pin', 96, 128, drawPin);
writeIcon('station-bolt', 96, 96, drawBolt);
