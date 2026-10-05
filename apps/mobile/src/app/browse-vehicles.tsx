import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, ChevronLeft } from 'lucide-react-native';
import { VehicleListItem } from '../components/VehicleListItem';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonList } from '../components/ui/Skeleton';
import { ChipSelect } from '../components/ui/ChipSelect';
import { pullToRefresh, useRefresh } from '../components/ui/PullToRefresh';
import { useDebounced } from '../hooks/useDebounced';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { COLORS } from '../constants/theme';
import { VEHICLE_CATEGORIES, VehicleCategory } from '../types/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT, type CopyKey } from '../i18n';

/**
 * Filter chips.
 *
 * The labels used to be derived from the enum value by capitalising it, which
 * only reads as a word at all in English — "scooter" has no capital form in
 * Tamil or Hindi, and the value itself is an API constant that must not
 * change. So each category gets a real key and the chips are built inside the
 * component, where a language change re-renders them.
 */
const CATEGORY_LABEL_KEY: Record<VehicleCategory | 'all', CopyKey> = {
  all: 'vehicles.category.all',
  scooter: 'vehicles.category.scooter',
  bike: 'vehicles.category.bike',
  moped: 'vehicles.category.moped',
};

const CATEGORY_KEYS: (VehicleCategory | 'all')[] = ['all', ...VEHICLE_CATEGORIES];

export default function BrowseVehiclesScreen() {
  // AppShell insets its drawer sheet but not screen content, so each screen
  // pads its own scroll tail — otherwise the Android nav/gesture bar covers
  // the last rows.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useT();
  const { list, loadingList, listError, loadList, loadMore, pagination } = useVehicleCatalogStore();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<VehicleCategory | 'all'>('all');
  const debouncedSearch = useDebounced(search, 350);

  // Refetches page 1 under whatever search/category is active, so a pull never
  // silently resets the rider's filters back to "all".
  const { refreshing, onRefresh } = useRefresh(() =>
    loadList({
      search: debouncedSearch || undefined,
      category: category === 'all' ? undefined : category,
    }),
  );

  useEffect(() => {
    void loadList({
      search: debouncedSearch || undefined,
      category: category === 'all' ? undefined : category,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View
        className="flex-row items-center px-4 border-b"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border, paddingTop: 52, paddingBottom: 14 }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-9 h-9 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: COLORS.background }}
        >
          <ChevronLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: COLORS.textPrimary }} className="text-base font-extrabold flex-1">
          {t('vehicles.title')}
        </Text>
      </View>

      <View className="px-5 pt-4">
        <View
          className="flex-row items-center rounded-2xl px-4 border mb-4"
          style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
        >
          <Search size={16} color={COLORS.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('vehicles.searchPlaceholder')}
            placeholderTextColor={COLORS.textSecondary}
            className="flex-1 py-3 ml-2.5 text-sm"
            style={{ color: COLORS.textPrimary }}
          />
        </View>

        <ChipSelect
          options={CATEGORY_KEYS.map((key) => ({ key, label: t(CATEGORY_LABEL_KEY[key]) }))}
          value={category}
          onChange={setCategory}
        />
      </View>

      {loadingList && list.length === 0 ? (
        <View className="px-5"><SkeletonList count={4} /></View>
      ) : listError ? (
        <ErrorState message={listError} onRetry={() => void loadList({ search: debouncedSearch || undefined, category: category === 'all' ? undefined : category })} />
      ) : list.length === 0 ? (
        <EmptyState icon={Search} title={t('vehicles.empty.title')} subtitle={t('vehicles.empty.subtitle')} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => <VehicleListItem model={item} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          refreshControl={pullToRefresh(refreshing, onRefresh)}
          ListFooterComponent={
            pagination && pagination.page < pagination.totalPages && loadingList
              ? <View className="py-4"><SkeletonList count={1} /></View>
              : null
          }
        />
      )}
    </View>
  );
}
