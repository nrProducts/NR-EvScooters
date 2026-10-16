/**
 * Generates the battery-station marker icons used by the Battery Stations
 * map — one image per status colour:
 *
 *   node scripts/generate-station-icons.mjs
 *
 * Each image is the full marker: a rounded teardrop pin with a white bolt in
 * its head, standing on concentric ripple rings (the "charging point with
 * indicator" mark). The bolt and ripples are baked into the one image, so the
 * map needs a single symbol layer per marker. The PNGs this writes ARE
 * committed — the script is here so they can be regenerated, not run at build.
 *
 * Four pre-coloured images, not one tinted at render time via an SDF
 * `icon-color`: SDF tinting needs a genuine signed-distance field, and a
 * flat RGBA image is the approach already proven reliable on this map.
 *
 *   station-pin-working.png       green  (COLORS.success)
 *   station-pin-maintenance.png   amber  (COLORS.warning)
 *   station-pin-not-working.png   red    (COLORS.danger)
 *   station-pin-offline.png       grey   (COLORS.gray[500]) — fallback
 *
 * Geometry is in image pixels. The pin's TIP and the ripples' centre sit at
 * (TIP_X, TIP_Y); BatteryStationMarker anchors the image at its bottom edge
 * and offsets it by TIP_OFFSET_FROM_BOTTOM (H - TIP_Y) so the tip lands on
 * the coordinate. Shapes are rasterised 4x4 supersampled for smooth edges.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'map');

// Mirrors apps/mobile/src/constants/theme.ts COLORS — kept in sync by hand.
const STATUS_COLORS = {
    working: '#21C45D',
    maintenance: '#F59E0B',
    'not-working': '#EF4444',
    offline: '#6B7280',
};

const W = 200;
const H = 240;
const TIP_X = 100;
const TIP_Y = 212;
const HEAD_Y = 84;
const HEAD_R = 56;

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// --- shapes: each is (x, y) => boolean ------------------------------------

const inEllipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

function ring(cx, cy, rx, ry, w) {
    const outer = inEllipse(cx, cy, rx + w / 2, ry + w / 2);
    const inner = inEllipse(cx, cy, rx - w / 2, ry - w / 2);
    return (x, y) => outer(x, y) && !inner(x, y);
}

function inPolygon(points, x, y) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Teardrop: head circle plus the tangent triangle down to the tip. */
function teardrop() {
    const d = TIP_Y - HEAD_Y;
    const alpha = Math.asin(HEAD_R / d);
    // Distance from the tip to each tangent point, and the half-angle at the tip.
    const along = Math.sqrt(d * d - HEAD_R * HEAD_R);
    const dy = along * Math.cos(alpha);
    const dx = along * Math.sin(alpha);
    const tri = [[TIP_X, TIP_Y], [TIP_X - dx, TIP_Y - dy], [TIP_X + dx, TIP_Y - dy]];
    const head = inEllipse(TIP_X, HEAD_Y, HEAD_R, HEAD_R);
    return (x, y) => head(x, y) || inPolygon(tri, x, y);
}

/** Bold bolt, corners rounded by dilating a slimmer core by BOLT_ROUND. */
function bolt() {
    const BOLT_ROUND = 3.5;
    const core = [
        [7, -28], [-15, 4], [-2, 4], [-8, 28], [15, -6], [2, -6],
    ].map(([x, y]) => [TIP_X + x, HEAD_Y + y]);
    return (x, y) => {
        if (inPolygon(core, x, y)) return true;
        for (let i = 0; i < core.length; i++) {
            if (distToSegment(x, y, core[i], core[(i + 1) % core.length]) <= BOLT_ROUND) return true;
        }
        return false;
    };
}

// --- rasteriser -----------------------------------------------------------

const SS = 4;

/** layers: [{ shape, color: (x, y) => [r,g,b], opacity }], painted in order. */
function render(layers) {
    const data = new Uint8Array(W * H * 4);
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (const { shape, color, opacity } of layers) {
                let hit = 0;
                for (let sy = 0; sy < SS; sy++) {
                    for (let sx = 0; sx < SS; sx++) {
                        if (shape(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS)) hit++;
                    }
                }
                const cov = (hit / (SS * SS)) * opacity;
                if (cov === 0) continue;
                const [lr, lg, lb] = color(px + 0.5, py + 0.5);
                const outA = cov + a * (1 - cov);
                r = (lr * cov + r * a * (1 - cov)) / outA;
                g = (lg * cov + g * a * (1 - cov)) / outA;
                b = (lb * cov + b * a * (1 - cov)) / outA;
                a = outA;
            }
            const i = (py * W + px) * 4;
            data[i] = Math.round(r);
            data[i + 1] = Math.round(g);
            data[i + 2] = Math.round(b);
            data[i + 3] = Math.round(a * 255);
        }
    }
    return { width: W, height: H, data };
}

function drawMarker(colorHex) {
    const base = hexToRgb(colorHex);
    const light = mix(base, [255, 255, 255], 0.28);
    const solid = (rgb) => () => rgb;
    // Pin body: lighter at the top, true status colour toward the tip.
    const body = (_x, y) => mix(light, base, Math.min(1, Math.max(0, (y - 28) / 150)));

    return render([
        { shape: ring(TIP_X, TIP_Y, 88, 22, 4), color: solid(base), opacity: 0.22 },
        { shape: ring(TIP_X, TIP_Y, 62, 15, 4), color: solid(base), opacity: 0.38 },
        { shape: inEllipse(TIP_X, TIP_Y, 38, 9), color: solid(base), opacity: 0.3 },
        { shape: inEllipse(TIP_X, TIP_Y, 16, 4), color: solid(base), opacity: 0.55 },
        { shape: teardrop(), color: body, opacity: 1 },
        { shape: bolt(), color: solid([255, 255, 255]), opacity: 1 },
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

function writeIcon(name, canvas) {
    const file = join(OUT_DIR, `${name}.png`);
    writeFileSync(file, encodePng(canvas));
    console.log(`wrote ${file}`);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [status, hex] of Object.entries(STATUS_COLORS)) {
    writeIcon(`station-pin-${status}`, drawMarker(hex));
}
// Superseded: the bolt is baked into the pin now.
rmSync(join(OUT_DIR, 'station-bolt.png'), { force: true });
