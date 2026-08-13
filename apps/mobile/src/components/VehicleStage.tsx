import React from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { COLORS } from '../constants/theme';

/**
 * Showroom presentation for a vehicle model's catalog artwork: a lit backdrop,
 * a contact shadow, and the vehicle standing on it.
 *
 * ---------------------------------------------------------------------------
 * This component assumes CUT-OUT artwork — a subject on a transparent
 * background (PNG/WebP with an alpha channel).
 *
 * It used to assume the opposite. The catalog originally held vendor shots
 * with a grey background baked into the pixels, and two behaviours existed
 * purely to cope with that:
 *
 *   1. The stage took the image's own aspect ratio once loaded, so a
 *      `contain`ed shot could never letterbox into grey gutters that clashed
 *      with the stage's own grey.
 *   2. `compact` switched to `cover` (cropping) for the same reason.
 *
 * Both are actively harmful for cut-outs and have been removed:
 *
 *   - Aspect-ratio-driven height turned a square 2000x2000 cut-out into a
 *     full-width SQUARE stage — roughly 360dp tall where the caller asked for
 *     200 — which is what broke the Home layout. Worse, the backdrop <Svg>
 *     sizes itself in percentages, and it did not repaint when the container
 *     grew after load, so the stage rendered grey down to the original height
 *     and bare card-white below it.
 *   - `cover` crops a cut-out through the vehicle itself, since a cut-out has
 *     no disposable background margin to trim.
 *
 * `height` is now always binding, so layout is known before the image loads
 * and never shifts under the user. Transparent margins simply let the backdrop
 * show through, which is the whole point of the stage.
 * ---------------------------------------------------------------------------
 */
interface VehicleStageProps {
  imageUrl: string | null;
  /** Stage height in px. Always binding — the stage never resizes itself. */
  height: number;
  /** Vehicle width as a share of the stage. */
  imageWidth?: DimensionValue;
  /**
   * Tighter treatment for secondary surfaces (a detail screen) where the full
   * showroom would dominate the page: less zoom and a fainter contact shadow.
   * No longer changes how the image is fitted — nothing here ever crops.
   */
  compact?: boolean;
  /**
   * Scales the artwork past the stage box so the surrounding transparent
   * margin is clipped rather than displayed.
   *
   * Stock cut-outs are typically drawn on a square canvas with generous empty
   * padding, so a plain `contain` into a wide banner leaves the vehicle
   * marooned in the middle at a fraction of the available width. Scaling up
   * and letting `overflow: hidden` trim the excess costs nothing (the trimmed
   * pixels are transparent) and makes the vehicle read at banner scale.
   *
   * Raise it for art with heavy padding; drop it to 1 for art already cropped
   * tight to the subject.
   */
  zoom?: number;
  shadow?: { bottom: number; width: DimensionValue; height: number };
  accessibilityLabel?: string;
}

export const VehicleStage: React.FC<VehicleStageProps> = ({
  imageUrl,
  height,
  imageWidth = '100%',
  compact = false,
  zoom,
  shadow,
  accessibilityLabel,
}) => {
  // react-native-svg resolves fill="url(#id)" against a shared registry, so two
  // stages on one screen would fight over the same gradient without this.
  const uid = React.useId().replace(/:/g, '');
  const backdropId = `stage-${uid}`;
  const contactId = `contact-${uid}`;
  const poolId = `pool-${uid}`;

  const resolvedZoom = zoom ?? (compact ? 1.12 : 1.2);
  const resolvedShadow = shadow ?? {
    bottom: Math.round(height * (compact ? 0.1 : 0.13)),
    width: compact ? '52%' : '60%',
    height: Math.max(10, Math.round(height * 0.075)),
  };

  return (
    <View
      style={{
        height,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        // Base fill under the SVG. The gradient below is the real backdrop;
        // this only guarantees that no measurement quirk in react-native-svg's
        // percentage sizing can ever expose bare card-white behind the stage —
        // the exact failure this component shipped with.
        backgroundColor: COLORS.gray[100],
      }}
    >
      {/* Backdrop: radial vignette, lighter at top-centre, so the stage reads
          as a lit studio sweep rather than a flat grey panel. RN has no CSS
          radial-gradient, hence an SVG rect. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={backdropId} cx="50%" cy="28%" rx="78%" ry="78%">
            <Stop offset="0%" stopColor={COLORS.white} />
            <Stop offset="55%" stopColor={COLORS.gray[100]} />
            <Stop offset="100%" stopColor={COLORS.gray[200]} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${backdropId})`} />
      </Svg>

      {/* Light pool on the floor, directly beneath the vehicle. Sits between
          the backdrop and the contact shadow so the shadow reads as sitting IN
          a pool of light — that separation is most of the depth cue. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: Math.round(resolvedShadow.bottom * 0.55),
          width: '82%',
          height: Math.max(16, Math.round(height * 0.16)),
          opacity: 0.7,
        }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={poolId} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={COLORS.white} stopOpacity={0.9} />
              <Stop offset="100%" stopColor={COLORS.white} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={`url(#${poolId})`} />
        </Svg>
      </View>

      {/* Contact shadow — what actually grounds the vehicle instead of leaving
          it floating. Always rendered now: with cut-out artwork the area under
          the vehicle is transparent, so it is genuinely visible (under the old
          `cover` behaviour it was hidden behind opaque pixels, which is why it
          used to be skipped when compact). */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: resolvedShadow.bottom,
          width: resolvedShadow.width,
          height: resolvedShadow.height,
          opacity: compact ? 0.26 : 0.34,
        }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={contactId} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor="#0F172A" stopOpacity={0.55} />
              <Stop offset="65%" stopColor="#0F172A" stopOpacity={0.12} />
              <Stop offset="100%" stopColor="#0F172A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={`url(#${contactId})`} />
        </Svg>
      </View>

      {imageUrl ? (
        <Image
          source={imageUrl}
          style={{
            width: imageWidth,
            height: '100%',
            // Nudged up so the vehicle sits ON the contact shadow rather than
            // centred in the box with the shadow floating below it.
            transform: [{ scale: resolvedZoom }, { translateY: -height * 0.04 }],
          }}
          // Never `cover`: cropping a cut-out cuts through the vehicle.
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={250}
          accessibilityLabel={accessibilityLabel}
        />
      ) : null}
    </View>
  );
};
