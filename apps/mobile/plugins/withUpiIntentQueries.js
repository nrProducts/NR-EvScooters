// Imported through the `expo` re-export, not `@expo/config-plugins` directly.
// Expo's docs are explicit about this: the re-export guarantees the exact
// version the installed `expo` package depends on. In this pnpm workspace the
// bare specifier resolves to the hoisted root copy, which is not necessarily
// the one SDK 54 expects.
const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Lets Razorpay Checkout see the UPI apps installed on the device.
 *
 * Android 11 (API 30) introduced package visibility filtering: an app can no
 * longer enumerate other installed apps unless it declares what it is looking
 * for in a <queries> block. Razorpay's UPI *intent* flow works by resolving
 * `upi://pay` and listing whatever can handle it — GPay, PhonePe, Paytm, BHIM.
 * Without this declaration that resolve returns nothing, so the intent apps
 * silently do not appear and the rider is left with only "enter UPI ID".
 *
 * Expo regenerates android/ on every prebuild and the directory is gitignored,
 * so editing AndroidManifest.xml by hand would be undone by the next build.
 * This plugin is the durable form of the same change.
 *
 * Note the scope of what this fixes: it restores the UPI APP ICONS when UPI is
 * already available. It cannot make the UPI section appear at all — that is a
 * merchant-account setting (Dashboard > Account & Settings > Payment Methods).
 */
const UPI_SCHEME = 'upi';

module.exports = function withUpiIntentQueries(config) {
    return withAndroidManifest(config, (cfg) => {
        const manifest = cfg.modResults.manifest;

        manifest.queries = manifest.queries ?? [{}];
        const queries = manifest.queries[0];
        queries.intent = queries.intent ?? [];

        const alreadyDeclared = queries.intent.some((intent) =>
            (intent.data ?? []).some((d) => d?.$?.['android:scheme'] === UPI_SCHEME),
        );
        if (alreadyDeclared) return cfg;

        queries.intent.push({
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
            data: [{ $: { 'android:scheme': UPI_SCHEME } }],
        });

        return cfg;
    });
};
