/**
 * Generates the battery marker icons used by the Battery Stations map.
 *
 *   node scripts/generate-station-icons.mjs
 *
 * Why a generator rather than committed art: these are three tiny
 * white-on-transparent glyphs that must stay visually consistent with each
 * other, and a script makes "nudge the stroke weight" a one-line change
 * instead of a round trip through a design tool. The PNGs it writes ARE
 * committed — this is here so they can be regenerated, not run at build time.
 *
 * Each icon is a battery outline plus a distinguishing inner glyph:
 *
 *   working      battery + check     the network is swappable here
 *   maintenance  battery + "!"       staff are working on it
 *   not-working  battery + cross     do not ride here expecting a swap
 *
 * The glyphs differ in SHAPE, not just the circle colour behind them. That is
 * the whole point: colour alone fails for red-green colour blindness, direct
 * sunlight, and greyscale screenshots.
 *
 * Rendered white so the marker layer can sit them on the status-coloured
 * circle without needing SDF tinting.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
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

function fillRect(canvas, x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) plot(canvas, x, y);
}

function clearRect(canvas, x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const i = (y * SIZE + x) * 4;
            canvas[i + 3] = 0;
        }
    }
}

/** Round-capped line, drawn by stamping a disc along the segment. */
function drawLine(canvas, x0, y0, x1, y1, radius) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0 : s / steps;
        const cx = x0 + (x1 - x0) * t;
        const cy = y0 + (y1 - y0) * t;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius) plot(canvas, cx + dx, cy + dy);
            }
        }
    }
}

/** The shared battery body: outline + terminal nub, hollow inside. */
function drawBattery(canvas) {
    fillRect(canvas, 8, 26, 74, 70);   // body
    clearRect(canvas, 15, 33, 67, 63); // hollow it out, leaving a 7px wall
    fillRect(canvas, 75, 40, 86, 56);  // terminal
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

// --- the three icons ----------------------------------------------------

const icons = {
    'station-working': (c) => {
        drawBattery(c);
        drawLine(c, 26, 48, 36, 57, 4);  // check: short down-stroke
        drawLine(c, 36, 57, 56, 39, 4);  // check: long up-stroke
    },
    'station-maintenance': (c) => {
        drawBattery(c);
        drawLine(c, 41, 37, 41, 51, 4);  // "!" stem
        drawLine(c, 41, 59, 41, 59, 4);  // "!" dot
    },
    'station-not-working': (c) => {
        drawBattery(c);
        drawLine(c, 30, 38, 52, 58, 4);  // cross
        drawLine(c, 52, 38, 30, 58, 4);
    },
};

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, draw] of Object.entries(icons)) {
    const canvas = createCanvas();
    draw(canvas);
    const file = join(OUT_DIR, `${name}.png`);
    writeFileSync(file, encodePng(canvas));
    console.log(`wrote ${file}`);
}
