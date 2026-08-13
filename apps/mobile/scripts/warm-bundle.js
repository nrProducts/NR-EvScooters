#!/usr/bin/env node
/**
 * Builds the dev bundle from the machine running Metro, before any device asks
 * for it.
 *
 * Why this exists: the Expo dev client fetches the bundle over HTTP and gives
 * up on a socket read timeout. Metro does not send response headers until the
 * whole bundle is transformed, so a cold build that takes longer than that
 * timeout surfaces on the phone as:
 *
 *   java.net.SocketTimeoutException: timeout
 *     at okhttp3...Http1ExchangeCodec.readResponseHeaders
 *   Caused by: java.net.SocketException: Socket closed
 *
 * ("Socket closed" is okio's AsyncTimeout closing the socket when the deadline
 * expires — a consequence of the timeout, not a separate fault.)
 *
 * On a low-RAM machine this project's cold dev bundle has been measured at
 * ~246s (3900 modules, React Compiler + Hermes bytecode, metro capped to 2
 * workers — see metro.config.js for why it is capped). The same request served
 * from a warm cache takes ~1s. curl has no such timeout, so building it from
 * here first turns the device's request into a cache hit.
 *
 * Usage: start Metro, then in a second terminal run `pnpm warm`, wait for it to
 * report done, and only then scan the QR.
 */

const DEFAULT_PORT = process.env.RCT_METRO_PORT || 8081;
const HOST = process.env.METRO_HOST || '127.0.0.1';
const PLATFORM = process.argv[2] || 'android';

/**
 * Ask the dev server for its manifest rather than hand-assembling the bundle
 * URL. The query string carries transform flags (routerRoot, reactCompiler,
 * bytecode...) that must match what the client sends or Metro treats it as a
 * different build and the warm cache buys nothing.
 */
async function bundleUrlFromManifest(base) {
  const res = await fetch(base, {
    headers: { 'expo-platform': PLATFORM, accept: 'application/expo+json,application/json' },
  });
  if (!res.ok) throw new Error(`manifest request failed: HTTP ${res.status}`);
  const manifest = await res.json();
  const url = manifest?.launchAsset?.url;
  if (!url) throw new Error('manifest carried no launchAsset.url');
  return url;
}

async function main() {
  const base = `http://${HOST}:${DEFAULT_PORT}/`;

  let bundleUrl;
  try {
    bundleUrl = await bundleUrlFromManifest(base);
  } catch (err) {
    console.error(`\n  Could not reach Metro at ${base}`);
    console.error(`  ${err.message}`);
    console.error('\n  Start it first:  npx expo start --dev-client\n');
    process.exit(1);
  }

  // The manifest reports whatever host Metro advertises (often a LAN IP). Warm
  // over loopback regardless — same cache, no dependency on Wi-Fi.
  const local = bundleUrl.replace(/^http:\/\/[^/]+/, `http://${HOST}:${DEFAULT_PORT}`);

  console.log(`\n  Warming ${PLATFORM} bundle — a cold build can take several minutes.`);
  console.log('  Leave this running; do not scan the QR until it finishes.\n');

  const started = Date.now();
  const res = await fetch(local);
  // Metro streams the body only after the transform completes; drain it so the
  // timer covers the real build, not just the response headers.
  const body = await res.arrayBuffer();
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  if (!res.ok) {
    console.error(`  FAILED: HTTP ${res.status} after ${secs}s`);
    console.error(Buffer.from(body).toString('utf8').slice(0, 600));
    process.exit(1);
  }

  console.log(`  Done in ${secs}s — ${(body.byteLength / 1024 / 1024).toFixed(1)} MB cached.`);
  console.log('  Safe to scan the QR now.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
