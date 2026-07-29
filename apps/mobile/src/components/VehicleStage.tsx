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
 * The vehicle is always `contain`ed — cropping a product shot is the one thing
 * this presentation must never do.
 */
interface VehicleStageProps {
  imageUrl: string | null;
  /** Fallback stage height, used until the image's aspect ratio is known. */
  height: number;
  /** Vehicle width as a share of the stage. */
  imageWidth?: DimensionValue;
  shadow?: { bottom: number; width: DimensionValue; height: number };
  accessibilityLabel?: string;
}

export const VehicleStage: React.FC<VehicleStageProps> = ({
  imageUrl,
  height,
  imageWidth = '100%',
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
        aspectRatio ? { width: '100%', aspectRatio } : { height },
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

      {imageUrl ? (
        <Image
          source={imageUrl}
          style={{ width: imageWidth, height: '100%' }}
          contentFit="contain"
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
