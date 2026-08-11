import React, { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { COLORS } from '../../constants/theme';

/**
 * Builds the themed pull-to-refresh control for a ScrollView/FlatList.
 *
 *     <ScrollView refreshControl={pullToRefresh(refreshing, onRefresh)}>
 *
 * DO NOT turn this into a component that renders <RefreshControl>. It must be
 * a function returning the element itself.
 *
 * On Android, ScrollView does not render `refreshControl` as a child — it does
 * `cloneElement(refreshControl, {style}, <NativeScrollView>{content}</...>)`,
 * i.e. it hands the entire scroll content to the element as *children* and
 * relies on RefreshControl to render them. A wrapper component that accepts
 * only {refreshing, onRefresh} silently drops those children, and every screen
 * using it renders completely empty with no error. iOS puts the control in as a
 * sibling instead, so the bug is invisible there.
 *
 * Kept in one place because iOS reads `tintColor` and Android reads `colors`:
 * screens that inlined <RefreshControl> kept setting one, or neither, and
 * fell back to the platform grey instead of the brand green.
 */
export function pullToRefresh(refreshing: boolean, onRefresh: () => void) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={COLORS.primary}
      colors={[COLORS.primary]}
      progressBackgroundColor={COLORS.card}
    />
  );
}

/**
 * Wraps an async reload so screens don't each re-invent the
 * `useState` + try/finally dance around the spinner flag.
 *
 * The returned `refreshing` is driven only by this hook, never by the
 * underlying query's own loading flag — otherwise a background refetch that
 * the rider did not initiate would spin the pull control on its own.
 */
export function useRefresh(reload: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        await reload();
      } catch {
        // Swallowed on purpose: the screen's own error state already renders
        // whatever went wrong. Rethrowing here would surface an unhandled
        // rejection and leave the spinner stuck on.
      } finally {
        setRefreshing(false);
      }
    })();
  }, [reload]);

  return { refreshing, onRefresh };
}
