import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, ScrollView,
  RefreshControl, ActivityIndicator, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Search, Plus, Users as UsersIcon, Pencil, Trash2, SlidersHorizontal,
  Bike, CreditCard, RotateCcw, Ban, CheckCircle2, PauseCircle, ShieldCheck,
} from 'lucide-react-native';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { SkeletonList } from '../components/ui/Skeleton';
import { UserFormModal } from '../components/users/UserFormModal';
import { useDebounced } from '../hooks/useDebounced';
import { useUsers, DEFAULT_USER_FILTERS, type UserFilters } from '../hooks/useUsers';
import { useAuthStore, useIsAdmin } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { COLORS } from '../constants/theme';
import {
  ACCOUNT_STATUS_TONE, KYC_STATUS_LABEL, KYC_STATUS_TONE, formatDate, initialsOf,
} from '../constants/status';
import type { AccountStatus, ApiUser, ApiUserDetail, KycStatus, StatusAction } from '../types/api';

const ACCOUNT_FILTERS: { key: AccountStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'suspended', label: 'Suspended' },
];

const KYC_FILTERS: { key: KycStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Any KYC' },
  { key: 'not_submitted', label: 'Not Submitted' },
  { key: 'pending', label: 'Pending' },
  { key: 'partially_verified', label: 'Partly' },
  { key: 'verified', label: 'Verified' },
  { key: 'rejected', label: 'Rejected' },
];

export default function UsersScreen() {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const meId = useAuthStore((s) => s.profile?.id);

  const [filters, setFilters] = useState<UserFilters>(DEFAULT_USER_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounced(searchInput, 400);

  // The hook owns fetching, pagination and mutation state.
  const {
    users, pagination, loading, refreshing, loadingMore, error, busyId,
    refresh, retry, loadMore, actions,
  } = useUsers({ ...filters, search: debouncedSearch });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ApiUserDetail | null>(null);

  const setFilter = <K extends keyof UserFilters>(key: K, value: UserFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = async (user: ApiUser) => {
    // The list row is a summary; the form needs the full record.
    const result = await actions.getDetail(user.id);
    if (result instanceof ApiError) {
      Alert.alert('Could not open', result.message);
      return;
    }
    setEditing(result);
    setFormOpen(true);
  };

  const runStatus = async (user: ApiUser, action: StatusAction, reason?: string) => {
    const result = await actions.changeStatus(user.id, action, reason);
    if (result instanceof ApiError) Alert.alert('Action failed', result.message);
  };

  const confirmStatus = (user: ApiUser, action: StatusAction) => {
    if (action === 'suspend') {
      // The API rejects a suspension with no reason, so collect one rather
      // than letting the request bounce. Alert.prompt is iOS-only; Android
      // gets a confirm dialog with a recorded default reason.
      if (Alert.prompt) {
        Alert.prompt(
          'Suspend account',
          `Why is ${user.full_name} being suspended? This is written to the audit log.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Suspend',
              style: 'destructive',
              onPress: (reason?: string) => {
                if (!reason || reason.trim().length < 5) {
                  Alert.alert('Reason required', 'Give a reason of at least 5 characters.');
                  return;
                }
                void runStatus(user, 'suspend', reason.trim());
              },
            },
          ],
          'plain-text',
        );
      } else {
        Alert.alert(
          'Suspend account',
          `Suspend ${user.full_name}? This is recorded in the audit log.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Suspend',
              style: 'destructive',
              onPress: () => void runStatus(user, 'suspend', 'Suspended by administrator from mobile'),
            },
          ],
        );
      }
      return;
    }

    const verb = action === 'activate' ? 'Activate' : 'Deactivate';
    Alert.alert(`${verb} account`, `${verb} ${user.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: verb, onPress: () => void runStatus(user, action) },
    ]);
  };

  const confirmDelete = (user: ApiUser) => {
    Alert.alert(
      'Delete user',
      `Delete ${user.full_name}? Their scooter returns to the fleet and they can no longer sign in. Invoices, rentals and KYC history are kept, and an admin can restore the account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await actions.remove(user.id);
            if (result instanceof ApiError) Alert.alert('Delete failed', result.message);
          },
        },
      ],
    );
  };

  const confirmRestore = (user: ApiUser) => {
    Alert.alert(
      'Restore user',
      `Restore ${user.full_name}? The account returns as inactive so you can review it before activating.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const result = await actions.restore(user.id);
            if (result instanceof ApiError) Alert.alert('Restore failed', result.message);
          },
        },
      ],
    );
  };

  const header = (
    <View>
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text style={{ color: COLORS.textPrimary }} className="text-xl font-black">
            Manage Users
          </Text>
          <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium mt-0.5">
            {pagination ? `${users.length} of ${pagination.total} accounts` : 'Loading accounts...'}
          </Text>
        </View>
        {isAdmin ? (
          <TouchableOpacity
            onPress={openAdd}
            accessibilityRole="button"
            accessibilityLabel="Add user"
            className="flex-row items-center px-3.5 py-2.5 rounded-xl"
            style={{ backgroundColor: COLORS.primary }}
          >
            <Plus size={16} color="#FFF" />
            <Text className="text-white font-bold text-xs ml-1.5">Add User</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        className="flex-row items-center rounded-2xl px-4 py-3 mb-3 border"
        style={{ backgroundColor: COLORS.card, borderColor: COLORS.border }}
      >
        <Search size={16} color={COLORS.textSecondary} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search name, email, phone or document no..."
          placeholderTextColor={COLORS.textSecondary}
          autoCapitalize="none"
          accessibilityLabel="Search users"
          className="flex-1 text-sm font-semibold ml-2.5"
          style={{ color: COLORS.textPrimary }}
        />
        {searchInput !== debouncedSearch ? (
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-2.5"
        contentContainerStyle={{ gap: 8 }}
      >
        <View className="flex-row items-center mr-1">
          <SlidersHorizontal size={13} color={COLORS.textSecondary} />
        </View>
        {ACCOUNT_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={filters.accountStatus === f.key}
            onPress={() => setFilter('accountStatus', f.key)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-3"
        contentContainerStyle={{ gap: 8 }}
      >
        {KYC_FILTERS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={filters.kycStatus === f.key}
            onPress={() => setFilter('kycStatus', f.key)}
          />
        ))}
      </ScrollView>

      {isAdmin ? (
        <TouchableOpacity
          onPress={() => setFilter('includeDeleted', !filters.includeDeleted)}
          accessibilityRole="switch"
          accessibilityState={{ checked: filters.includeDeleted }}
          className="flex-row items-center self-start px-3 py-2 rounded-xl border mb-4"
          style={{
            backgroundColor: filters.includeDeleted ? COLORS.danger + '10' : COLORS.card,
            borderColor: filters.includeDeleted ? COLORS.danger : COLORS.border,
          }}
        >
          <Trash2 size={12} color={filters.includeDeleted ? COLORS.danger : COLORS.textSecondary} />
          <Text
            style={{ color: filters.includeDeleted ? COLORS.danger : COLORS.textSecondary }}
            className="text-[11px] font-bold ml-1.5"
          >
            {filters.includeDeleted ? 'Showing deleted' : 'Show deleted'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <AppShell title="Manage Users">
      <View className="flex-1 px-5 pt-5">
        {loading ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {header}
            <SkeletonList count={4} />
          </ScrollView>
        ) : error ? (
          <ScrollView showsVerticalScrollIndicator={false}>
            {header}
            <ErrorState message={error.message} offline={error.isOffline} onRetry={() => void retry()} />
          </ScrollView>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(u) => u.id}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
            onEndReached={() => void loadMore()}
            onEndReachedThreshold={0.4}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={
              <EmptyState
                icon={UsersIcon}
                title="No users found"
                subtitle="Try a different search term or filter."
              />
            }
            ListFooterComponent={
              loadingMore ? (
                <View className="py-6">
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              ) : pagination && users.length >= pagination.total && users.length > 0 ? (
                <Text
                  style={{ color: COLORS.textSecondary }}
                  className="text-[11px] font-semibold text-center py-6"
                >
                  All {pagination.total} accounts loaded
                </Text>
              ) : null
            }
            renderItem={({ item }) => (
              <UserCard
                user={item}
                isAdmin={isAdmin}
                isSelf={item.id === meId}
                busy={busyId === item.id}
                onEdit={() => void openEdit(item)}
                onDelete={() => confirmDelete(item)}
                onRestore={() => confirmRestore(item)}
                onStatus={(action) => confirmStatus(item, action)}
                onReviewKyc={() => router.push(`/kyc-review?userId=${item.id}`)}
              />
            )}
          />
        )}
      </View>

      <UserFormModal
        visible={formOpen}
        editing={editing}
        isAdmin={isAdmin}
        onClose={() => setFormOpen(false)}
        onSaved={() => void refresh()}
        onCreate={actions.create}
        onUpdate={actions.update}
      />
    </AppShell>
  );
}

const FilterChip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label, active, onPress,
}) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    className="flex-row items-center px-3.5 py-2 rounded-xl border"
    style={{
      backgroundColor: active ? COLORS.primary : COLORS.card,
      borderColor: active ? COLORS.primary : COLORS.border,
    }}
  >
    <Text style={{ color: active ? '#FFF' : COLORS.textPrimary }} className="text-xs font-bold">
      {label}
    </Text>
  </TouchableOpacity>
);

interface UserCardProps {
  user: ApiUser;
  isAdmin: boolean;
  isSelf: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onStatus: (action: StatusAction) => void;
  onReviewKyc: () => void;
}

const UserCard: React.FC<UserCardProps> = ({
  user, isAdmin, isSelf, busy, onEdit, onDelete, onRestore, onStatus, onReviewKyc,
}) => {
  const deleted = !!user.deleted_at;

  return (
    <View
      className="rounded-2xl p-4 border"
      style={{
        backgroundColor: COLORS.card,
        borderColor: deleted ? COLORS.danger + '40' : COLORS.border,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-row items-center flex-1 mr-3">
          <View
            className="w-10 h-10 rounded-xl items-center justify-center mr-3"
            style={{ backgroundColor: COLORS.primary + '14' }}
          >
            <Text style={{ color: COLORS.primary }} className="text-xs font-black">
              {initialsOf(user.full_name)}
            </Text>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <Text
                style={{ color: COLORS.textPrimary }}
                className="text-sm font-extrabold"
                numberOfLines={1}
              >
                {user.full_name}
              </Text>
              {isSelf ? (
                <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold ml-1.5">
                  (you)
                </Text>
              ) : null}
            </View>
            <Text
              style={{ color: COLORS.textSecondary }}
              className="text-[11px] font-medium mt-0.5"
              numberOfLines={1}
            >
              {user.email ?? '—'}
            </Text>
            <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium">
              {user.phone ?? '—'}
            </Text>
          </View>
        </View>
        <View style={{ gap: 6 }} className="items-end">
          <Badge
            label={deleted ? 'deleted' : user.account_status}
            tone={deleted ? 'danger' : ACCOUNT_STATUS_TONE[user.account_status]}
          />
          <Badge label={KYC_STATUS_LABEL[user.kyc_status]} tone={KYC_STATUS_TONE[user.kyc_status]} />
        </View>
      </View>

      <View
        className="flex-row items-center justify-between pt-3 border-t"
        style={{ borderColor: COLORS.border }}
      >
        <View className="flex-row items-center flex-1">
          <Bike size={12} color={COLORS.textSecondary} />
          <Text
            style={{ color: COLORS.textPrimary }}
            className="text-[11px] font-bold ml-1.5"
            numberOfLines={1}
          >
            {user.assigned_vehicle ? user.assigned_vehicle.model : 'No scooter'}
          </Text>
        </View>
        <View className="flex-row items-center flex-1 justify-center">
          <CreditCard size={12} color={COLORS.textSecondary} />
          <Text
            style={{ color: COLORS.textPrimary }}
            className="text-[11px] font-bold ml-1.5"
            numberOfLines={1}
          >
            {user.current_plan ? user.current_plan.name : 'No plan'}
          </Text>
        </View>
        <Text
          style={{ color: COLORS.textSecondary }}
          className="text-[11px] font-medium flex-1 text-right"
        >
          {formatDate(user.created_at)}
        </Text>
      </View>

      {user.roles.length > 0 ? (
        <View className="flex-row flex-wrap mt-3" style={{ gap: 6 }}>
          {user.roles.map((r) => (
            <Badge key={r} label={r.replace('_', ' ')} tone="primary" />
          ))}
        </View>
      ) : null}

      <View
        className="flex-row items-center mt-3.5 pt-3 border-t"
        style={{ borderColor: COLORS.border, gap: 8 }}
      >
        {deleted ? (
          isAdmin ? (
            <TouchableOpacity
              onPress={onRestore}
              disabled={busy}
              accessibilityRole="button"
              className="flex-row items-center px-3 py-2 rounded-xl flex-1 justify-center"
              style={{ backgroundColor: COLORS.primary + '14' }}
            >
              <RotateCcw size={13} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary }} className="text-[11px] font-bold ml-1.5">
                Restore
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              className="flex-1 px-3 py-2 rounded-xl items-center"
              style={{ backgroundColor: COLORS.background }}
            >
              <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-semibold">
                Deleted account
              </Text>
            </View>
          )
        ) : (
          <>
            {user.account_status === 'active' ? (
              <TouchableOpacity
                onPress={() => onStatus('deactivate')}
                disabled={busy || isSelf}
                accessibilityRole="button"
                className="flex-row items-center px-3 py-2 rounded-xl flex-1 justify-center"
                style={{ backgroundColor: isSelf ? COLORS.background : COLORS.warning + '14' }}
              >
                <PauseCircle size={13} color={isSelf ? COLORS.textSecondary : COLORS.warning} />
                <Text
                  style={{ color: isSelf ? COLORS.textSecondary : COLORS.warning }}
                  className="text-[11px] font-bold ml-1.5"
                >
                  Deactivate
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => onStatus('activate')}
                disabled={busy}
                accessibilityRole="button"
                className="flex-row items-center px-3 py-2 rounded-xl flex-1 justify-center"
                style={{ backgroundColor: COLORS.success + '14' }}
              >
                <CheckCircle2 size={13} color={COLORS.success} />
                <Text style={{ color: COLORS.success }} className="text-[11px] font-bold ml-1.5">
                  Activate
                </Text>
              </TouchableOpacity>
            )}

            {user.account_status !== 'suspended' && !isSelf ? (
              <TouchableOpacity
                onPress={() => onStatus('suspend')}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Suspend account"
                className="w-9 h-9 rounded-xl items-center justify-center"
                style={{ backgroundColor: COLORS.danger + '10' }}
              >
                <Ban size={14} color={COLORS.danger} />
              </TouchableOpacity>
            ) : null}

            {user.kyc_status === 'pending' || user.kyc_status === 'partially_verified' ? (
              <TouchableOpacity
                onPress={onReviewKyc}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Review KYC"
                className="w-9 h-9 rounded-xl items-center justify-center"
                style={{ backgroundColor: COLORS.primary + '14' }}
              >
                <ShieldCheck size={14} color={COLORS.primary} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={onEdit}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Edit user"
              className="w-9 h-9 rounded-xl items-center justify-center border"
              style={{ borderColor: COLORS.border }}
            >
              <Pencil size={14} color={COLORS.textSecondary} />
            </TouchableOpacity>

            {isAdmin && !isSelf ? (
              <TouchableOpacity
                onPress={onDelete}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Delete user"
                className="w-9 h-9 rounded-xl items-center justify-center"
                style={{ backgroundColor: COLORS.danger + '10' }}
              >
                <Trash2 size={14} color={COLORS.danger} />
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
};
