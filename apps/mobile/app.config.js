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
      /**
       * Permissions pulled in by dependencies that this app does not use.
       * Autolinked libraries merge their own <uses-permission> entries into
       * AndroidManifest.xml, so the app ends up ASKING FOR MORE THAN IT NEEDS
       * unless they are blocked here. Both of these were present in the
       * generated manifest and are removed deliberately:
       *
       *   RECORD_AUDIO       — added by expo-image-picker for video capture.
       *                        Every picker call in lib/filePicker.ts passes
       *                        mediaTypes: ['images'], so the app never
       *                        records audio. Play treats the microphone as a
       *                        sensitive permission: shipping it means a
       *                        Data Safety disclosure and a justification for
       *                        a capability the app does not have.
       *
       *   SYSTEM_ALERT_WINDOW — React Native's "draw over other apps" overlay,
       *                        used by the dev-mode redbox//dev menu. It has
       *                        no purpose in a release build and is a
       *                        permission reviewers reliably ask about.
       *
       * Deliberately NOT blocked: READ_EXTERNAL_STORAGE. minSdkVersion is 24,
       * and on Android 12 and below picking a KYC document out of the gallery
       * genuinely needs it — removing it would break document upload on older
       * phones, which is a large share of the rider base. Declare it in the
       * Play Console instead. WRITE_EXTERNAL_STORAGE is likewise left alone
       * pending a check on a real Android 12 device; it is inert on Android 11+.
       */
      blockedPermissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
      adaptiveIcon: {
        backgroundColor: '#21C45D',
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
        'expo-splash-screen',
        {
          backgroundColor: '#21C45D',
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 140,
          },
        },
      ],
      [
        'expo-notifications',
        {
          color: '#21C45D',
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
      // Second source for the same EXPO_PUBLIC_* values that babel inlines
      // into the bundle — src/constants/env.ts reads `extra` when the inlined
      // value is missing or empty.
      //
      // This file is evaluated by Node on the build machine, where
      // `process.env` is fully populated (from apps/mobile/.env locally, or
      // from EAS environment variables during a cloud build), and the result
      // is embedded in the app manifest. So it does not depend on the babel
      // inlining transform having fired, which is what silently failed before
      // and shipped a release build that could not reach the backend at all.
      //
      // Anything listed here ships in the APK/AAB and is readable by anyone
      // who unpacks it. Public client config ONLY: the API base URL, the
      // Supabase URL and the ANON key (RLS constrains it). Never the
      // service-role key, and never a Razorpay secret — the app receives the
      // Razorpay PUBLIC key id per order from the backend instead.
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_MAP_STYLE_URL: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
      EXPO_PUBLIC_GEOCODE_URL: process.env.EXPO_PUBLIC_GEOCODE_URL,
    },
    owner: 'nr-products',
  },
};
