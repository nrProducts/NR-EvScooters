import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, ChevronLeft } from 'lucide-react-native';
import { VehicleListItem } from '../components/VehicleListItem';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonList } from '../components/ui/Skeleton';
import { ChipSelect } from '../components/ui/ChipSelect';
import { useDebounced } from '../hooks/useDebounced';
import { useVehicleCatalogStore } from '../store/useVehicleCatalogStore';
import { COLORS } from '../constants/theme';
import { VEHICLE_CATEGORIES, VehicleCategory } from '../types/api';

const CATEGORY_OPTIONS: { key: VehicleCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...VEHICLE_CATEGORIES.map((c) => ({ key: c, label: c[0].toUpperCase() + c.slice(1) })),
];

export default function BrowseVehiclesScreen() {
  const router = useRouter();
  const { list, loadingList, listError, loadList, loadMore, pagination } = useVehicleCatalogStore();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<VehicleCategory | 'all'>('all');
  const debouncedSearch = useDebounced(search, 350);

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
          Available Vehicles
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
            placeholder="Search scooters"
            placeholderTextColor={COLORS.textSecondary}
            className="flex-1 py-3 ml-2.5 text-sm"
            style={{ color: COLORS.textPrimary }}
          />
        </View>

        <ChipSelect options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </View>

      {loadingList && list.length === 0 ? (
        <View className="px-5"><SkeletonList count={4} /></View>
      ) : listError ? (
        <ErrorState message={listError} onRetry={() => void loadList({ search: debouncedSearch || undefined, category: category === 'all' ? undefined : category })} />
      ) : list.length === 0 ? (
        <EmptyState icon={Search} title="No scooters found" subtitle="Try a different search or category." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
          renderItem={({ item }) => <VehicleListItem model={item} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
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
