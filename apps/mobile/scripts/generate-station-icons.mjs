/**
 * Generates the battery-station marker icons used by the Battery Stations
 * map — one location-pin per status colour, plus a bolt glyph layered on
 * top of each (see BatteryStationMarker.tsx / BatteryStationMapView.web.tsx):
 *
 *   node scripts/generate-station-icons.mjs
 *
 * Why a generator rather than committed art: these are tiny flat glyphs, and
 * a script makes "nudge the stroke weight" a one-line change instead of a
 * round trip through a design tool. The PNGs it writes ARE committed — this
 * is here so they can be regenerated, not run at build time.
 *
 * Four pre-coloured pins (one per status), not one white pin tinted at
 * render time via an SDF `icon-color`: SDF tinting needs the browser/native
 * GL layer to treat the image as a genuine signed-distance field, and a
 * plain hard-edged alpha mask like these generator primitives draw is not
 * one — it rendered unreliably (markers not appearing at all on some
 * builds). Four flat RGBA images, exactly like the three status icons this
 * replaced, is the same approach already proven to work earlier in this
 * file's history — see git log for the pre-SDF version.
 *
 *   station-pin-working.png       green pin (COLORS.success)
 *   station-pin-maintenance.png   amber pin (COLORS.warning)
 *   station-pin-not-working.png   red pin   (COLORS.danger)
 *   station-pin-offline.png       grey pin  (COLORS.gray[500]) — fallback
 *                                  for a status this match expression
 *                                  doesn't recognise.
 *   station-bolt.png              white bolt, layered on top of every pin.
 *
 * Each pin is drawn as a white halo shape slightly larger than the coloured
 * fill on top of it — baked-in contrast against the map tiles underneath,
 * since a flat RGBA image has no paint-time icon-halo-color the way an SDF
 * icon would.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'map');

// Mirrors apps/mobile/src/constants/theme.ts COLORS — kept in sync by hand,
// same as every other duplicated brand-colour constant in this repo.
const STATUS_COLORS = {
    working: '#21C45D',
    maintenance: '#F59E0B',
    'not-working': '#EF4444',
    offline: '#6B7280',
};

// --- tiny raster canvas -------------------------------------------------

function createCanvas(width, height) {
    return { width, height, data: new Uint8Array(width * height * 4) }; // RGBA, all transparent
}

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function plot(canvas, x, y, [r, g, b], alpha = 255) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return;
    const i = (py * canvas.width + px) * 4;
    canvas.data[i] = r;
    canvas.data[i + 1] = g;
    canvas.data[i + 2] = b;
    // Keep the strongest alpha so overlapping shapes don't thin out.
    canvas.data[i + 3] = Math.max(canvas.data[i + 3], alpha);
}

function fillCircle(canvas, cx, cy, r, rgb) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) plot(canvas, x, y, rgb);
        }
    }
}

/**
 * Fills a closed polygon (list of [x, y] vertices, in order) with a classic
 * scanline algorithm: for each row, find where the polygon's edges cross it,
 * sort those x's, and fill the spans between each pair.
 */
function fillPolygon(canvas, points, rgb) {
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
            for (let x = xStart; x <= xEnd; x++) plot(canvas, x, y, rgb);
        }
    }
}

const WHITE = [255, 255, 255];

/**
 * The classic map-pin silhouette: a round head (circle) with a triangular
 * tail tapering to a point, the two composited together. Union of a circle
 * and a triangle rather than one smooth bezier outline — this generator has
 * no curve-fill primitive, and at the ~20px the map actually renders this
 * icon, the straight tangent seam disappears into the downsample anyway.
 *
 * Drawn twice at two radii: a white halo (bigger) first, then the status
 * colour (smaller) on top, baking in a crisp border against the map tiles.
 */
function drawPinShape(canvas, cx, cy, r, tailHalfWidth, tailTipY, rgb) {
    fillCircle(canvas, cx, cy, r, rgb);
    fillPolygon(canvas, [
        [cx - tailHalfWidth, cy + r * 0.6],
        [cx + tailHalfWidth, cy + r * 0.6],
        [cx, tailTipY],
    ], rgb);
}

function drawPin(canvas, colorHex) {
    const cx = 48;
    const cy = 44;
    drawPinShape(canvas, cx, cy, 36, 28, 126, WHITE);
    drawPinShape(canvas, cx, cy, 30, 22, 120, hexToRgb(colorHex));
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
    ], WHITE);
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
for (const [status, hex] of Object.entries(STATUS_COLORS)) {
    writeIcon(`station-pin-${status}`, 96, 128, (canvas) => drawPin(canvas, hex));
}
writeIcon('station-bolt', 96, 96, drawBolt);
