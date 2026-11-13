/**
 * Generates the dark-mode app icons — the normal SNG icon with its headlight ON:
 *
 *   node scripts/generate-dark-icons.mjs
 *
 * Light mode keeps the existing green icons untouched. Dark mode is the SAME
 * green icon with one change: the headlamp is lit and a soft warm-white beam
 * fans out ahead of the scooter (option B of the headlight review).
 *
 *   apps/mobile/assets/images/icon-dark.png   1024 full-bleed — iOS 18 dark
 *                                             app icon (app.config.js ios.icon.dark)
 *   apps/web/src/assets/logo-icon-dark.png    192 rounded — admin icon, dark theme
 *   apps/web/src/assets/logo-wordmark-night.svg  admin sidebar wordmark, dark theme
 *   apps/web/src/assets/logo-mark-night.svg      admin loading screen, dark theme
 *   apps/web/public/favicon.svg               the browser-tab icon; switches by
 *                                             itself with the OS theme via
 *                                             prefers-color-scheme
 *   apps/mobile/assets/images/android-icon-{background,foreground}-dark.png
 *                                             Android launcher icon in dark mode
 *                                             (plugins/withNightLauncherIcon.js)
 *   apps/mobile/assets/images/logo-icon-dark.png  512 rounded — the app icon
 *                                             inside the rider app, dark mode
 *   apps/mobile/assets/images/logo-wordmark-dark.png, logo-lockup-dark.png
 *                                             rider app header / home hero
 *                                             logos when the phone is in dark mode
 *
 * The PNGs ARE committed — this script is here to regenerate them, not run at
 * build. It renders through a locally installed Chrome or Edge (headless), as
 * the artwork needs gradients and blur that a hand-rolled rasteriser (see
 * generate-station-icons.mjs) can't do. Android has no official dark-icon
 * slot; its night layers are installed as a "night" resource variant, which
 * launchers that honour it switch to (see plugins/withNightLauncherIcon.js).
 *
 * The icons are built ON TOP of the light originals (icon.png, the Android
 * layers, logo-mark.svg), so the two versions can never drift apart.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { PNG } = createRequire(import.meta.url)('pngjs');

const APPS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGES = join(APPS, 'mobile/assets/images');
const MARK_D = readFileSync(join(APPS, 'web/src/assets/logo-mark.svg'), 'utf8').match(/ d="([^"]+)"/)[1];
const dataUri = (file) => `data:image/png;base64,${readFileSync(join(IMAGES, file)).toString('base64')}`;

const BRAND_GREEN = '#21C45D';
// The light icon's own tile gradient (icon.png / android-icon-background.png).
const TILE = { from: '#3CCB73', to: '#17924A' };
// A warm amber lamp with a small glow, not white: it reads as a real bulb and
// stands out against the white scooter instead of blending into it.
const LAMP = { main: '#FFC24D', deep: '#FF9A1F', core: '#FFE29A', soft: '#FFB43A', lens: '#FFE9B0' };
// Mirrors the console's dark theme in apps/web/src/index.css — keep in sync.
const CONSOLE_GREEN = '#34C973'; // .dark --primary
// The wordmark's gradient: from --primary to --brand-from, the lighter half of
// the button gradient. Its darkest end (--brand-to, #0B5A2D) would vanish
// against the dark sidebar.
const CONSOLE_WORDMARK_GRADIENT = ['#34C973', '#1E9A52'];

/*
 * Geometry, in a 1024 icon. The headlamp lens on icon.png is the ellipse at
 * (747, 423.5), rx 9.5, ry 23; the lamp face is at x ~ 760. In logo-mark.svg's
 * own space the lens is at (676, 156), rx 11, ry 23.
 */
const ICON_LENS = { cx: 747, cy: 423.5, rx: 9.5, ry: 23 };
const MARK_LENS = { cx: 676, cy: 156, rx: 11, ry: 23 };

/**
 * The light, "Bloom and rays" (option E of the headlight-glow review): a small
 * soft amber halo around the lamp plus three short warm streaks ahead of it,
 * all ending around x 862, well inside the tile. A glow, not a beam.
 */
function beam() {
  return `
    <circle cx="${ICON_LENS.cx + 4}" cy="${ICON_LENS.cy}" r="56" fill="url(#halo)" />
    <g stroke="url(#rays)" stroke-linecap="round" fill="none">
      <path d="M776 404 L852 388" stroke-width="8" />
      <path d="M778 424 L862 424" stroke-width="9" />
      <path d="M776 444 L852 460" stroke-width="8" />
    </g>`;
}

/** The lens filled in warm, drawn over the halo. */
function lamp() {
  return `
    <ellipse cx="${ICON_LENS.cx}" cy="${ICON_LENS.cy}" rx="${ICON_LENS.rx + 2}" ry="${ICON_LENS.ry + 2}" fill="${LAMP.lens}" />`;
}

function defs() {
  return `
    <linearGradient id="tileGreen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TILE.from}" />
      <stop offset="1" stop-color="${TILE.to}" />
    </linearGradient>
    <radialGradient id="halo">
      <stop offset="0" stop-color="${LAMP.main}" stop-opacity="0.85" />
      <stop offset="0.45" stop-color="${LAMP.soft}" stop-opacity="0.35" />
      <stop offset="1" stop-color="${LAMP.deep}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="rays" gradientUnits="userSpaceOnUse" x1="772" y1="0" x2="860" y2="0">
      <stop offset="0" stop-color="${LAMP.main}" stop-opacity="0.95" />
      <stop offset="1" stop-color="${LAMP.soft}" stop-opacity="0" />
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="7" />
    </filter>`;
}

/** The night icon: the light icon.png with its lamp lit. `radius` rounds the tile; 0 is full bleed. */
function nightIcon(radius) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>${defs()}
    <clipPath id="tile"><rect width="1024" height="1024" rx="${radius}" /></clipPath>
  </defs>
  <g clip-path="url(#tile)">
    <image href="${dataUri('icon.png')}" width="1024" height="1024" />
    ${beam()}
    ${lamp()}
  </g>
</svg>`;
}

/*
 * Android's adaptive icon is two layers the launcher masks into its own shape.
 * The light foreground (android-icon-foreground.png) holds the mark at 0.7406
 * of its size on icon.png, offset by (132.6, 132.4) — measured from the two
 * images' mark bounding boxes — so the beam and lens, drawn in icon space,
 * go through that transform to line up with it.
 */
const ADAPTIVE_TRANSFORM = 'translate(132.6 132.4) scale(0.7406)';

/** Night adaptive-icon background: the same green as the day one. */
function nightAdaptiveBackground() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <image href="${dataUri('android-icon-background.png')}" width="1024" height="1024" />
</svg>`;
}

/** Night adaptive-icon foreground: the day foreground with its lamp lit. */
function nightAdaptiveForeground() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>${defs()}</defs>
  <image href="${dataUri('android-icon-foreground.png')}" width="1024" height="1024" />
  <g transform="${ADAPTIVE_TRANSFORM}">
    ${beam()}
    ${lamp()}
  </g>
</svg>`;
}

/**
 * The browser-tab icon. Light: unchanged — the white disc with the green mark.
 * Dark (OS theme): the app icon's look — a green disc, the mark in white, the
 * lamp lit. One file, so no <link media> juggling in index.html. The beam and
 * halo are drawn in icon space, so they are mapped back into the mark's
 * coordinates by the inverse of the icon's mark placement
 * (translate(154.2 283) scale(0.877)).
 */
function favicon() {
  const toMarkSpace = 'scale(1.140251) translate(-154.2 -283)';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-17 -165 850 850">
  <style>
    .night, .lit { display: none; }
    @media (prefers-color-scheme: dark) {
      .day { display: none; }
      .night, .lit { display: inline; }
      .mark { fill: #FFFFFF; }
    }
  </style>
  <defs>${defs()}
    <clipPath id="disc"><circle cx="408" cy="260" r="420" /></clipPath>
  </defs>
  <circle class="day" cx="408" cy="260" r="420" fill="#FFFFFF" />
  <circle class="night" cx="408" cy="260" r="420" fill="url(#tileGreen)" />
  <g class="lit" clip-path="url(#disc)"><g transform="${toMarkSpace}">${beam()}</g></g>
  <path class="mark" d="${MARK_D}" fill="${BRAND_GREEN}" fill-rule="evenodd" />
  <ellipse class="lit" cx="${MARK_LENS.cx}" cy="${MARK_LENS.cy}" rx="${MARK_LENS.rx}" ry="${MARK_LENS.ry}" fill="${LAMP.lens}" /></svg>
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
  render(nightIcon(0), 1024, join(IMAGES, 'icon-dark.png'), browser, work);
  // Same corner rounding as the light logo-icon.png (~27% of the width).
  render(nightIcon(280), 192, join(APPS, 'web/src/assets/logo-icon-dark.png'), browser, work);
  // The rider app's in-app copy.
  render(nightIcon(280), 512, join(IMAGES, 'logo-icon-dark.png'), browser, work);
  // Android's night launcher icon (plugins/withNightLauncherIcon.js). 432px is
  // a 108dp adaptive layer at xxxhdpi.
  render(nightAdaptiveBackground(), 432, join(IMAGES, 'android-icon-background-dark.png'), browser, work);
  render(nightAdaptiveForeground(), 432, join(IMAGES, 'android-icon-foreground-dark.png'), browser, work);
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
  for (const name of ['logo-wordmark', 'logo-lockup']) {
    lightenInk(join(IMAGES, `${name}.png`), join(IMAGES, `${name}-dark.png`));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
