import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML document for the web export ONLY — Expo Router's `+html` file
 * convention (https://docs.expo.dev/router/reference/static-rendering/) is
 * read exclusively by the web bundler; a native (iOS/Android/Play Store)
 * build never renders this file, so nothing here can affect the native app.
 *
 * Everything except the <style id="text-scale"> block is copied verbatim
 * from Expo's own default (node_modules/expo-router/build/static/html.js) —
 * this file, once it exists, REPLACES that default rather than extending it,
 * so the viewport meta / IE compat tag / ScrollViewStyleReset all have to be
 * reproduced here or the web build silently loses them.
 *
 * ── Why the font-size fix lives here, not in global.css ──────────────────
 *
 * global.css's `@theme` block is read by NativeWind for BOTH platforms —
 * it's the same mechanism that gives native and web their identical brand
 * colors — so shrinking `--text-*` there would shrink the native app's
 * fonts too, which nobody asked for. This file is the one place a rule can
 * be guaranteed web-only without gating on Platform.OS in every component.
 *
 * ── The scale itself ───────────────────────────────────────────────────
 *
 * Each step is shifted down to the PREVIOUS Tailwind default step (2xl ->
 * old xl's value, lg -> old base's value, etc.) rather than shrinking every
 * size by an arbitrary independent amount — reusing Tailwind's own scale
 * one notch down preserves the exact ratios between heading/body/caption
 * sizes instead of flattening the hierarchy. xs has no smaller predefined
 * step to borrow from, so it drops by the same ~10% the rest of the scale
 * moves.
 *
 * !important on each: a plain :root override could lose the cascade to
 * NativeWind's generated stylesheet depending on where Expo injects it in
 * <head> relative to this file's content, which isn't something this file
 * controls. !important removes that ordering dependency.
 */
function TextScaleOverride() {
  return (
    <style
      id="text-scale"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `:root{
          --text-xs: 0.6875rem !important;   /* 12px -> 11px */
          --text-sm: 0.75rem !important;     /* 14px -> 12px (old xs) */
          --text-base: 0.875rem !important;  /* 16px -> 14px (old sm) */
          --text-lg: 1rem !important;        /* 18px -> 16px (old base) */
          --text-xl: 1.125rem !important;    /* 20px -> 18px (old lg) */
          --text-2xl: 1.25rem !important;    /* 24px -> 20px (old xl) */
          --text-3xl: 1.5rem !important;     /* 30px -> 24px (old 2xl) */
          --text-4xl: 1.875rem !important;   /* 36px -> 30px (old 3xl) */
          --text-5xl: 2.25rem !important;    /* 48px -> 36px (old 4xl) */
        }`,
      }}
    />
  );
}

/**
 * react-native-web renders every <TextInput> as a real DOM <input>/
 * <textarea>, so it inherits the browser's default focus ring — a thick
 * blue rectangle Chrome/Safari draw on focus. Native has no such thing (a
 * focused TextInput there just shows the blinking caret our own borderColor
 * styling already reacts to), so the ring reads as a bug import from the
 * web platform, not a native behaviour reproduced correctly. Stripping
 * `outline` site-wide removes only that ring — the text caret itself is a
 * separate, unaffected browser feature and keeps blinking normally.
 */
function FocusRingReset() {
  return (
    <style
      id="focus-ring-reset"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `input, textarea, select { outline: none !important; }`,
      }}
    />
  );
}

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <TextScaleOverride />
        <FocusRingReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
