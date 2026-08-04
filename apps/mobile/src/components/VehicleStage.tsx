import React from 'react';
import { View, type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { COLORS } from '../constants/theme';

/**
 * Showroom presentation for a vehicle model's catalog artwork, per
 * docs/Mobile app image creation/Scooter Animation.dc.html: a lit backdrop and
 * a contact shadow, with the vehicle sitting above it.
 *
 * The design's tilt/shadow loop was dropped on request — this is the static
 * pose only.
 *
 * The full-size presentation always `contain`s the vehicle — cropping a
 * product shot is the one thing it must never do. `compact` is the documented
 * exception; see that prop.
 */
interface VehicleStageProps {
  imageUrl: string | null;
  /**
   * Stage height. Normally a fallback used only until the image's aspect ratio
   * is known — pass `compact` to make it binding.
   */
  height: number;
  /** Vehicle width as a share of the stage. */
  imageWidth?: DimensionValue;
  /**
   * Fixed-height, full-bleed banner for secondary surfaces (a detail screen)
   * where the full showroom treatment would dominate the page.
   *
   * Switches to `cover`, which is the ONE place this component crops. It has
   * to: `contain` inside a short box scales the artwork down until it only
   * fills a fraction of the width, leaving the backdrop visible either side —
   * and since the catalog shots carry their own baked-in grey background, that
   * reads as two mismatched greys rather than a deliberate stage.
   *
   * Safe because the source shots are framed with generous empty margin, so
   * what gets trimmed is background, not vehicle. Keep `height` a modest
   * fraction of the card width or that stops being true.
   */
  compact?: boolean;
  shadow?: { bottom: number; width: DimensionValue; height: number };
  accessibilityLabel?: string;
}

export const VehicleStage: React.FC<VehicleStageProps> = ({
  imageUrl,
  height,
  imageWidth = '100%',
  compact = false,
  shadow = { bottom: 34, width: '64%', height: 16 },
  accessibilityLabel,
}) => {
  // A fixed height would letterbox a `contain`ed image into grey gutters. Once
  // the source dimensions arrive the stage takes the image's own aspect ratio,
  // so the vehicle spans the full width with nothing cropped.
  const [aspectRatio, setAspectRatio] = React.useState<number | null>(null);
  React.useEffect(() => setAspectRatio(null), [imageUrl]);
  // react-native-svg resolves fill="url(#id)" against a shared registry, so two
  // stages on one screen would fight over the same gradient without this.
  const uid = React.useId().replace(/:/g, '');
  const backdropId = `stage-${uid}`;
  const contactId = `contact-${uid}`;

  return (
    <View
      style={[
        { overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
        aspectRatio && !compact ? { width: '100%', aspectRatio } : { height },
      ]}
    >
      {/* Backdrop: radial vignette, lighter at top-centre. RN has no CSS
          radial-gradient, so this is an SVG rect filled with one. */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
        <Defs>
          <RadialGradient id={backdropId} cx="50%" cy="30%" rx="75%" ry="75%">
            <Stop offset="0%" stopColor={COLORS.gray[100]} />
            <Stop offset="100%" stopColor={COLORS.gray[200]} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${backdropId})`} />
      </Svg>

      {/* Skipped when compact: a full-bleed image covers the stage floor, so
          the contact shadow would sit behind the artwork and never be seen. */}
      {compact ? null : (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: shadow.bottom,
            width: shadow.width,
            height: shadow.height,
            opacity: 0.3,
          }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id={contactId} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor="#141414" stopOpacity={0.5} />
                <Stop offset="70%" stopColor="#141414" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={`url(#${contactId})`} />
          </Svg>
        </View>
      )}

      {imageUrl ? (
        <Image
          source={imageUrl}
          style={{ width: compact ? '100%' : imageWidth, height: '100%' }}
          contentFit={compact ? 'cover' : 'contain'}
          cachePolicy="memory-disk"
          transition={250}
          accessibilityLabel={accessibilityLabel}
          onLoad={({ source }) => {
            if (source?.width && source?.height) setAspectRatio(source.width / source.height);
          }}
        />
      ) : null}
    </View>
  );
};
