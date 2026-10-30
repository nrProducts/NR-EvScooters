/**
 * Generates the dark-mode app icons — the SNG scooter with its headlight ON:
 *
 *   node scripts/generate-dark-icons.mjs
 *
 * Light mode keeps the existing green icons untouched. Dark mode swaps in a
 * night version: black background, the mark in brand green, the headlamp
 * lens lit and a soft yellow beam fanning out ahead of the scooter.
 *
 *   apps/mobile/assets/images/icon-dark.png   1024 full-bleed — iOS 18 dark
 *                                             app icon (app.config.js ios.icon.dark)
 *   apps/web/src/assets/logo-icon-dark.png    192 rounded — admin sidebar/footer
 *                                             while the console is in dark theme
 *   apps/web/src/assets/logo-wordmark-night.svg  admin sidebar wordmark, dark theme
 *   apps/web/src/assets/logo-mark-night.svg      admin loading screen, dark theme
 *   apps/web/public/favicon.svg               the browser-tab icon; switches by
 *                                             itself with the OS theme via
 *                                             prefers-color-scheme
 *   apps/mobile/assets/images/logo-wordmark-dark.png, logo-lockup-dark.png
 *                                             rider app header / home hero
 *                                             logos when the phone is in dark mode
 *
 * The admin console's dark theme uses its own green, "deep emerald"
 * (apps/web/src/index.css, .dark --primary / --brand-from / --brand-to), so
 * everything the console shows in dark mode is drawn in that green to match.
 * The iOS icon keeps the brand green: it sits on a phone home screen, not
 * inside the console.
 *
 * The PNGs ARE committed — this script is here to regenerate them, not run at
 * build. It renders through a locally installed Chrome or Edge (headless), as
 * the artwork needs gradients and blur that a hand-rolled rasteriser (see
 * generate-station-icons.mjs) can't do. Android has no dark-icon slot, so the
 * launcher icon there stays the green one.
 *
 * The mark's outline is read from apps/web/src/assets/logo-mark.svg, the same
 * vector the light icons were drawn from, so both versions match exactly.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { PNG } = createRequire(import.meta.url)('pngjs');

const APPS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARK_D = readFileSync(join(APPS, 'web/src/assets/logo-mark.svg'), 'utf8').match(/ d="([^"]+)"/)[1];

// Chosen look (option C1 of the night-icon review): OLED black tile, brand
// green scooter, yellow soft-cone headlight.
const BRAND_GREEN = '#21C45D';
const NIGHT_TOP = '#0E0E0E';
const NIGHT_BOTTOM = '#000000';
const LAMP = { deep: '#FFC21A', main: '#FFD43B', soft: '#FFE477', core: '#FFF4B8', lens: '#FFF9DB' };
// Mirrors the console's dark theme in apps/web/src/index.css — keep in sync.
const CONSOLE_GREEN = '#34C973'; // .dark --primary
// The wordmark's gradient: from --primary to --brand-from, the lighter half of
// the button gradient. Its darkest end (--brand-to, #0B5A2D) would vanish
// against the dark sidebar.
const CONSOLE_WORDMARK_GRADIENT = ['#34C973', '#1E9A52'];

/** feColorMatrix row values that paint a colour, for the mark filter below. */
const rgbChannels = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));

/*
 * Geometry, in a 1024 canvas. The mark is placed exactly where it sits on the
 * light icon (icon.png): mark-space (x, y) -> (154.2 + 0.877x, 283 + 0.877y).
 * In mark space the headlamp lens is the ellipse at (676, 156), rx 11, ry 23,
 * and the lamp's face is at x ~ 690.
 */
const MARK_TRANSFORM = 'translate(154.2 283) scale(0.877)';
const LENS = { cx: 676, cy: 156, rx: 11, ry: 23 };

/**
 * The beam, drawn under the mark so the mark stays crisp. It leaves the lamp
 * face and dips slightly, like a real dipped beam, clearing the top of the G.
 * A wide soft cone plus a brighter core.
 */
function beam() {
  return `
    <path d="M748 400 L1060 352 L1060 612 L748 440 Z" fill="url(#beam)" filter="url(#soft)" />
    <path d="M752 410 L1060 418 L1060 530 L752 430 Z" fill="url(#beamCore)" filter="url(#soft)" />`;
}

function defs() {
  return `
    <linearGradient id="night" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${NIGHT_TOP}" />
      <stop offset="1" stop-color="${NIGHT_BOTTOM}" />
    </linearGradient>
    <linearGradient id="beam" gradientUnits="userSpaceOnUse" x1="760" y1="0" x2="1024" y2="0">
      <stop offset="0" stop-color="${LAMP.main}" stop-opacity="0.95" />
      <stop offset="0.55" stop-color="${LAMP.main}" stop-opacity="0.45" />
      <stop offset="1" stop-color="${LAMP.deep}" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="beamCore" gradientUnits="userSpaceOnUse" x1="760" y1="0" x2="1024" y2="0">
      <stop offset="0" stop-color="${LAMP.core}" stop-opacity="1" />
      <stop offset="0.6" stop-color="${LAMP.soft}" stop-opacity="0.4" />
      <stop offset="1" stop-color="${LAMP.soft}" stop-opacity="0" />
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="${LAMP.lens}" stop-opacity="0.95" />
      <stop offset="0.3" stop-color="${LAMP.main}" stop-opacity="0.55" />
      <stop offset="1" stop-color="${LAMP.deep}" stop-opacity="0" />
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" />
    </filter>`;
}

/*
 * For the full-size icons the mark is lifted straight out of the light icon
 * (icon.png: a white mark on green) rather than drawn from logo-mark.svg —
 * that vector is a polyline trace whose facets show at 1024px. The filter
 * keys alpha off the red channel (background never exceeds 60, the mark is
 * 255, edges blend between) and paints it in `markColor`.
 */
const LIGHT_ICON = `data:image/png;base64,${readFileSync(join(APPS, 'mobile/assets/images/icon.png')).toString('base64')}`;
// The lens hole as measured on icon.png, in 1024 icon space.
const ICON_LENS = { cx: 747, cy: 423.5, rx: 9.5, ry: 23 };

/** The mark with its lens filled in and glowing. */
function litMark(markColor) {
  const [r, g, b] = rgbChannels(markColor);
  return `
    <filter id="markOnly" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="
        0 0 0 0 ${r}
        0 0 0 0 ${g}
        0 0 0 0 ${b}
        1.3077 0 0 0 -0.3077" />
    </filter>
    <image href="${LIGHT_ICON}" width="1024" height="1024" filter="url(#markOnly)" />
    <ellipse cx="${ICON_LENS.cx}" cy="${ICON_LENS.cy}" rx="${ICON_LENS.rx + 1}" ry="${ICON_LENS.ry + 1}" fill="${LAMP.lens}" />
    <circle cx="${ICON_LENS.cx + 4}" cy="${ICON_LENS.cy}" r="60" fill="url(#glow)" />`;
}

/** The night icon as a standalone SVG. `radius` rounds the tile; 0 is full bleed. */
function nightIcon(radius, markColor) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>${defs()}
    <clipPath id="tile"><rect width="1024" height="1024" rx="${radius}" /></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <rect width="1024" height="1024" fill="url(#night)" />
    ${beam()}
    ${litMark(markColor)}
  </g>
</svg>`;
}

/**
 * The browser-tab icon. Light: unchanged — the white disc with the green mark,
 * framed exactly as before (mark at its own coordinates, disc r 420). Dark (OS
 * theme): a night disc with the headlight on, the mark in the console's dark
 * theme green. One file, so no <link media>
 * juggling in index.html. The beam and glow are drawn in icon space, so they
 * are mapped back into the mark's coordinates by the inverse of MARK_TRANSFORM.
 */
function favicon() {
  const toMarkSpace = 'scale(1.140251) translate(-154.2 -283)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-17 -165 850 850">
  <style>
    .night, .lit { display: none; }
    @media (prefers-color-scheme: dark) {
      .day { display: none; }
      .night, .lit { display: inline; }
      .mark { fill: ${CONSOLE_GREEN}; }
    }
  </style>
  <defs>${defs()}
    <clipPath id="disc"><circle cx="408" cy="260" r="420" /></clipPath>
  </defs>
  <circle class="day" cx="408" cy="260" r="420" fill="#FFFFFF" />
  <circle class="night" cx="408" cy="260" r="420" fill="url(#night)" />
  <g class="lit" clip-path="url(#disc)"><g transform="${toMarkSpace}">${beam()}</g></g>
  <path class="mark" d="${MARK_D}" fill="${BRAND_GREEN}" fill-rule="evenodd" />
  <ellipse class="lit" cx="${LENS.cx}" cy="${LENS.cy}" rx="${LENS.rx}" ry="${LENS.ry}" fill="${LAMP.lens}" />
  <g class="lit"><g transform="${toMarkSpace}"><circle cx="753" cy="420" r="60" fill="url(#glow)" /></g></g>
</svg>
`;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found — set CHROME_PATH to a Chromium-based browser.');
  return found;
}

/** Renders an SVG to a transparent PNG of size x size. */
function render(svg, size, outPath, browser, workDir) {
  const html = join(workDir, `render-${size}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><body style="margin:0;background:transparent">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block" />
    </body></html>`,
  );
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${outPath}`,
    pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  console.log('wrote', outPath);
}

/**
 * Copies a logo PNG with its near-black lettering turned near-white (the rider
 * app's dark-theme textPrimary), leaving the green and the transparency alone.
 * A pixel is "ink" when it is close to grey (low saturation) and dark; edge
 * pixels keep their alpha, so the anti-aliasing carries over.
 */
function lightenInk(src, dst) {
  const png = PNG.sync.read(readFileSync(src));
  const [r, g, b] = [0xf1, 0xf5, 0xf3];
  for (let i = 0; i < png.data.length; i += 4) {
    const px = png.data.subarray(i, i + 3);
    const max = Math.max(...px), min = Math.min(...px);
    if (max - min < 28 && max < 110) {
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b;
    }
  }
  writeFileSync(dst, PNG.sync.write(png));
  console.log('wrote', dst);
}

const browser = findBrowser();
const work = mkdtempSync(join(tmpdir(), 'dark-icons-'));
try {
  // iOS masks the icon itself, so the dark icon is a full-bleed square.
  render(nightIcon(0, BRAND_GREEN), 1024, join(APPS, 'mobile/assets/images/icon-dark.png'), browser, work);
  // Same corner rounding as the light logo-icon.png (~27% of the width).
  render(nightIcon(280, CONSOLE_GREEN), 192, join(APPS, 'web/src/assets/logo-icon-dark.png'), browser, work);
  writeFileSync(join(APPS, 'web/public/favicon.svg'), favicon());
  console.log('wrote', join(APPS, 'web/public/favicon.svg'));

  // The console's other logos, recoloured from their light originals so the
  // shapes can never drift apart.
  const assets = join(APPS, 'web/src/assets');
  const wordmark = readFileSync(join(assets, 'logo-wordmark-green.svg'), 'utf8')
    .replace(/stop-color="#3CCB73"/gi, `stop-color="${CONSOLE_WORDMARK_GRADIENT[0]}"`)
    .replace(/stop-color="#17924A"/gi, `stop-color="${CONSOLE_WORDMARK_GRADIENT[1]}"`);
  writeFileSync(join(assets, 'logo-wordmark-night.svg'), wordmark);
  console.log('wrote', join(assets, 'logo-wordmark-night.svg'));
  const mark = readFileSync(join(assets, 'logo-mark.svg'), 'utf8').replace(/fill="#21C45D"/gi, `fill="${CONSOLE_GREEN}"`);
  writeFileSync(join(assets, 'logo-mark-night.svg'), mark);
  console.log('wrote', join(assets, 'logo-mark-night.svg'));

  // The rider app's dark theme: its wordmark and lockup have near-black
  // lettering that would vanish on the dark header and hero card.
  const images = join(APPS, 'mobile/assets/images');
  for (const name of ['logo-wordmark', 'logo-lockup']) {
    lightenInk(join(images, `${name}.png`), join(images, `${name}-dark.png`));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
