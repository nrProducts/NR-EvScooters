// Imported through the `expo` re-export, not `@expo/config-plugins` directly —
// see withUpiIntentQueries.js for why.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Gives the Android launcher icon a dark-mode version: the SNG scooter at night
 * with its headlight on, on a black tile.
 *
 * Android has no "dark icon" setting the way iOS 18 has (app.config.js
 * ios.icon.dark). What it does have is resource qualifiers: a `-night` folder
 * is chosen over the plain one while the phone is in dark mode. So this adds
 * mipmap-night-anydpi-v26/ic_launcher(_round).xml, an adaptive icon built from
 * the night layers, beside the day one Expo generates. Launchers that resolve
 * the app icon with the phone's current mode (Pixel and other stock-style
 * launchers) switch with the theme; some others keep showing the day icon,
 * and a launcher may only pick the change up when it refreshes its icon cache.
 *
 * android/ is generated on every prebuild and gitignored, so this plugin is the
 * durable form of the change. The layers come from
 * scripts/generate-dark-icons.mjs; the monochrome (themed-icon) layer is
 * shared with the day icon.
 */
const LAYERS = {
  ic_launcher_night_background: 'assets/images/android-icon-background-dark.png',
  ic_launcher_night_foreground: 'assets/images/android-icon-foreground-dark.png',
};

const ADAPTIVE_ICON = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_night_background"/>
    <foreground android:drawable="@drawable/ic_launcher_night_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;

module.exports = function withNightLauncherIcon(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');

      // One full-size PNG per layer in drawable-nodpi; Android scales it per density.
      const drawables = path.join(res, 'drawable-nodpi');
      fs.mkdirSync(drawables, { recursive: true });
      for (const [name, source] of Object.entries(LAYERS)) {
        fs.copyFileSync(path.join(cfg.modRequest.projectRoot, source), path.join(drawables, `${name}.png`));
      }

      const nightIcons = path.join(res, 'mipmap-night-anydpi-v26');
      fs.mkdirSync(nightIcons, { recursive: true });
      for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
        fs.writeFileSync(path.join(nightIcons, file), ADAPTIVE_ICON);
      }
      return cfg;
    },
  ]);
};
