import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Platform, Animated, Dimensions } from 'react-native';
import { useScooterStore, SwapStation } from '../store/useScooterStore';
import { COLORS } from '../constants/theme';
import { useRouter } from 'expo-router';
import { Battery, MapPin, Compass, ArrowRight, ShieldCheck, Clock, Settings, Sparkles } from 'lucide-react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Center of Austin: (30.2672, -97.7431)
const AUSTIN_LAT = 30.2672;
const AUSTIN_LNG = -97.7431;

export default function StationMapScreen() {
  const { stations } = useScooterStore();
  const router = useRouter();

  const [selectedStation, setSelectedStation] = useState<SwapStation | null>(null);
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Animate slide up sheet
  useEffect(() => {
    if (selectedStation) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true
      }).start();
    }
  }, [selectedStation]);

  // Safe import react-native-maps
  let MapView: any = null;
  let Marker: any = null;
  if (Platform.OS !== 'web') {
    try {
      const Maps = require('react-native-maps');
      MapView = Maps.default;
      Marker = Maps.Marker;
    } catch (e) {
      console.log('Maps failed loading in stations locator.', e);
    }
  }

  // Web Fallback Renderer
  const renderWebMap = () => {
    return (
      <View className="flex-1 bg-slate-900 overflow-hidden relative">
        {/* Streets Grid */}
        <View className="absolute inset-0 opacity-15">
          <View className="absolute left-[20%] top-0 bottom-0 w-[1px] bg-emerald-400" />
          <View className="absolute left-[50%] top-0 bottom-0 w-[1px] bg-emerald-400" />
          <View className="absolute left-[80%] top-0 bottom-0 w-[1px] bg-emerald-400" />
          <View className="absolute top-[25%] left-0 right-0 h-[1px] bg-emerald-400" />
          <View className="absolute top-[65%] left-0 right-0 h-[1px] bg-emerald-400" />
        </View>

        {/* User dot */}
        <View className="absolute left-[50%] top-[55%] -translate-x-4 -translate-y-4 items-center justify-center">
          <View className="w-8 h-8 rounded-full bg-emerald-500/20 items-center justify-center animate-ping absolute" />
          <View className="w-5 h-5 rounded-full bg-emerald-500 border border-white items-center justify-center shadow-lg">
            <Compass size={12} color="#FFF" />
          </View>
        </View>

        {/* Stations */}
        {stations.map((st) => {
          const xOffset = 50 + (st.longitude - AUSTIN_LNG) * 45000;
          const yOffset = 55 - (st.latitude - AUSTIN_LAT) * 35000;

          return (
            <TouchableOpacity
              key={st.id}
              style={{
                position: 'absolute',
                left: `${xOffset}%`,
                top: `${yOffset}%`,
                transform: [{ translateX: -20 }, { translateY: -20 }]
              }}
              onPress={() => setSelectedStation(st)}
              activeOpacity={0.7}
            >
              {/* custom themed marker */}
              <View 
                style={{ backgroundColor: st.isMaintenanceHub ? COLORS.forestDeep : COLORS.primaryDark }}
                className="w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-md"
              >
                {st.isMaintenanceHub ? (
                  <Settings size={14} color={COLORS.primaryMedium} />
                ) : (
                  <Battery size={14} color="#FFF" fill="#FFF" />
                )}
              </View>
              <View 
                style={{ borderTopColor: st.isMaintenanceHub ? COLORS.forestDeep : COLORS.primaryDark }}
                className="w-0 h-0 border-t-[5px] border-l-[4px] border-r-[4px] border-l-transparent border-r-transparent mt-[-1px] align-center self-center"
              />
            </TouchableOpacity>
          );
        })}

        {/* Float tags */}
        <View className="absolute top-20 left-4 bg-black/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-zinc-800 flex-row items-center">
          <Sparkles size={14} color={COLORS.primaryLight} className="mr-1.5" />
          <Text className="text-white text-xs font-bold">Swap Station Web Grid</Text>
        </View>
      </View>
    );
  };

  // Google Maps Native Renderer
  const renderNativeMap = () => {
    return (
      <MapView
        provider="google"
        className="flex-1"
        initialRegion={{
          latitude: AUSTIN_LAT,
          longitude: AUSTIN_LNG,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03
        }}
        customMapStyle={stationMapStyle}
      >
        {/* User Dot */}
        <Marker coordinate={{ latitude: AUSTIN_LAT, longitude: AUSTIN_LNG }}>
          <View className="w-5 h-5 rounded-full bg-emerald-500 border border-white items-center justify-center shadow-lg">
            <Compass size={12} color="#FFF" />
          </View>
        </Marker>

        {/* Swap & maintenance hubs */}
        {stations.map((st) => (
          <Marker
            key={st.id}
            coordinate={{ latitude: st.latitude, longitude: st.longitude }}
            onPress={() => setSelectedStation(st)}
          >
            <View className="items-center">
              <View 
                style={{ backgroundColor: st.isMaintenanceHub ? COLORS.forestDeep : COLORS.primaryDark }}
                className="w-10 h-10 rounded-full items-center justify-center border-2 border-white shadow-lg"
              >
                {st.isMaintenanceHub ? (
                  <Settings size={14} color={COLORS.primaryMedium} />
                ) : (
                  <Battery size={14} color="#FFF" fill="#FFF" />
                )}
              </View>
              <View 
                style={{ borderTopColor: st.isMaintenanceHub ? COLORS.forestDeep : COLORS.primaryDark }}
                className="w-0 h-0 border-t-[5px] border-l-[4px] border-r-[4px] border-l-transparent border-r-transparent mt-[-1px]"
              />
            </View>
          </Marker>
        ))}
      </MapView>
    );
  };

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Map controller */}
      {Platform.OS === 'web' || !MapView ? renderWebMap() : renderNativeMap()}

      {/* FLOAT BACK BUTTON */}
      <View className="absolute top-12 left-4 z-30">
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-4 py-2.5 rounded-2xl flex-row items-center shadow-lg border border-emerald-100/30"
        >
          <Text style={{ color: COLORS.forestDeep }} className="font-extrabold text-xs">← Back</Text>
        </TouchableOpacity>
      </View>

      {/* BOTTOM SHEET DETAIL PANELS */}
      {selectedStation && (
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40
          }}
          className="bg-white dark:bg-zinc-950 rounded-t-3xl border-t border-emerald-100 shadow-2xl pt-2 pb-6"
        >
          <TouchableOpacity 
            onPress={() => setSelectedStation(null)}
            className="w-full py-2 items-center"
          >
            <View className="w-12 h-1.5 rounded-full bg-slate-200 dark:bg-zinc-800" />
          </TouchableOpacity>

          <View className="px-6 mt-2">
            <View className="flex-row justify-between items-start mb-4">
              <View className="flex-1 mr-4">
                <Text style={{ color: COLORS.forestDeep }} className="text-xl font-black dark:text-emerald-50">
                  {selectedStation.name}
                </Text>
                <View className="flex-row items-center mt-1">
                  <Clock size={12} color="#9CA3AF" className="mr-1" />
                  <Text className="text-slate-400 text-xs font-semibold">{selectedStation.operatingHours}</Text>
                </View>
              </View>

              <View className="bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 rounded">
                <Text style={{ color: COLORS.primaryDark }} className="text-[10px] font-black uppercase">
                  {selectedStation.id.split('-')[0]}
                </Text>
              </View>
            </View>

            {/* Availability details card */}
            <View className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-900 p-4 rounded-2xl mb-6">
              {selectedStation.isMaintenanceHub ? (
                <View>
                  <Text style={{ color: COLORS.forestDeep }} className="text-xs font-extrabold dark:text-emerald-100">
                    Certified Service Station
                  </Text>
                  <Text className="text-slate-400 text-[11px] mt-0.5 leading-normal">
                    This location has authorized mechanics for tire replacement, alignment, and computer updates.
                  </Text>
                </View>
              ) : (
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-slate-450 text-[10px] uppercase font-bold tracking-wider">Swapping Inventory</Text>
                    <Text style={{ color: COLORS.forestDeep }} className="text-lg font-black dark:text-zinc-200 mt-0.5">
                      {selectedStation.availableSwaps} Fully Charged Packs
                    </Text>
                    <Text className="text-slate-400 text-[10px] mt-0.5">Total capacity: {selectedStation.totalSlots} battery slots</Text>
                  </View>

                  <View className="bg-emerald-600 w-11 h-11 rounded-full items-center justify-center">
                    <Battery size={20} color="#FFF" fill="#FFF" />
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setSelectedStation(null)}
              style={{ backgroundColor: COLORS.primaryDark }}
              className="w-full py-4 rounded-xl justify-center items-center shadow-md shadow-emerald-950/20"
            >
              <Text className="text-white font-bold text-sm">Navigate Route ({selectedStation.distanceKm} km)</Text>
            </TouchableOpacity>

          </View>
        </Animated.View>
      )}

    </View>
  );
}

const stationMapStyle = [
  { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road", "style": "geometry.fill", "stylers": [{ "color": "#334155" }, { "opacity": 0.15 }] }
];
