/**
 * Dynamic config (JS), replacing the old static app.json — needed so
 * android.googleServicesFile can come from EAS's GOOGLE_SERVICES_JSON file
 * environment variable during cloud builds, while still falling back to the
 * local ./google-services.json file for local dev (that file is gitignored;
 * EAS Build never sees a repo-local file that isn't checked in, so it must be
 * uploaded as a secret file env var instead — see `eas env:set`).
 */
module.exports = {
  expo: {
    name: 'Swapngo',
    slug: 'nr-ev-scooters',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'nrevscooters',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/images/icon.png',
    },
    android: {
      package: 'com.nrproducts.evscooters',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#2EAF4A',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-build-properties',
        {
          android: {
            // R8: strips unused Java/Kotlin code and obfuscates what's left.
            enableMinifyInReleaseBuilds: true,
            // Must pair with minify — shrinks resources R8 proved unreachable
            // (see the plugin's own docs: shrinkResources without minify is a no-op).
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: '#2EAF4A',
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 140,
          },
        },
      ],
      [
        'expo-notifications',
        {
          color: '#2EAF4A',
        },
      ],
      '@maplibre/maplibre-react-native',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow Swapngo to use your location to show nearby battery swap stations and how far away they are.',
          locationWhenInUsePermission:
            'Allow Swapngo to use your location to show nearby battery swap stations and how far away they are.',
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      './plugins/withUpiIntentQueries',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '10abcda2-bd89-41f6-89c5-65dc28ce2155',
      },
    },
    owner: 'nr-products',
  },
};
