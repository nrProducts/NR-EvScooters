const os = require("os");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativewind } = require("nativewind/metro");

// Expo's default config plus debug IDs in the bundle, which is what lets
// Sentry match a release crash to the uploaded source maps.
const config = getSentryExpoConfig(__dirname);

// Metro defaults to one transform worker per CPU core. Each worker is a full
// Node process, and with the React Compiler + nativewind babel passes each one
// peaks around 400-600MB. On an 8-core / 6GB dev machine that exhausts physical
// RAM and V8 dies with "Fatal process out of memory: Zone" (an OS allocation
// refusal, not a heap-limit crash - the reported heap is only ~28MB), which
// leaves the bundle permanently stuck and the app never loads on device.
// Cap workers so peak transform memory stays well under available RAM.
const totalMemGb = os.totalmem() / 1024 ** 3;
config.maxWorkers = totalMemGb < 8 ? 2 : Math.min(4, os.cpus().length);

module.exports = withNativewind(config);
