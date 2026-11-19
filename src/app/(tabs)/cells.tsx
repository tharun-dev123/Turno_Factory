import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { CellListItem } from '@/components/cells/CellListItem';
import { FilterSheet } from '@/components/cells/FilterSheet';
import { StatCard } from '@/components/cells/StatCard';
import { AppText } from '@/components/ui/AppText';
import { BrandHeader } from '@/components/ui/BrandHeader';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { KeyboardAvoider } from '@/components/ui/KeyboardAware';
import { Pill } from '@/components/ui/Pill';
import { SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, MessageState } from '@/components/ui/StateViews';
import { TurnoLogo } from '@/components/ui/TurnoLogo';
import { appConfig } from '@/config/appConfig';
import { useAuth } from '@/context/AuthContext';
import { useCells } from '@/hooks/useCells';
import type { CellRecord } from '@/models/cell';
import { colors, radius, shadows } from '@/theme';
import { formatCount } from '@/utils/format';

/** 03 - All Cells Dashboard */
export default function AllCellsScreen() {
  const router = useRouter();
  const { canWrite } = useAuth();
  const { query, setQuery, manufacturer, setManufacturer, status: statusFilter, setStatus, filtersActive, clearAll, cells, stats, state, error, refreshing, refresh, retry } = useCells();

  const openCell = (cell: CellRecord) => router.push({ pathname: '/cell/[id]', params: { id: cell.id } });
  const searching = query.trim().length > 0 || filtersActive;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = (manufacturer !== null ? 1 : 0) + (statusFilter !== null ? 1 : 0);

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TurnoLogo height={28} />
            </View>
            <IconButton icon="refresh" accessibilityLabel="Refresh inventory" onPress={refresh} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <View>
              <AppText variant="headlineMd" accessibilityRole="header" style={{ fontFamily: 'HankenGrotesk_800ExtraBold' }}>
                Battery Inventory
              </AppText>
              <AppText variant="bodySm" color={colors.slate500}>
                Live assembly line registry
              </AppText>
            </View>
            <Pill label={`${appConfig.storage.name} ${state === 'error' ? 'Offline' : 'Synced'}`} tone={state === 'error' ? 'danger' : 'success'} dot />
          </View>
        </View>
      </BrandHeader>

      <FlatList
        data={state === 'ready' ? cells : []}
        keyExtractor={(cell) => cell.id}
        renderItem={({ item }) => <CellListItem cell={item} onPress={openCell} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.turnoOrange} colors={[colors.turnoOrange]} />}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                label="Total Cells"
                value={stats ? formatCount(stats.total) : '—'}
                caption={stats ? `+${formatCount(stats.addedToday)} today` : '—'}
                captionIcon="trending-up"
                icon="inventory-2"
                accent
              />
              <StatCard
                label="Recently Added"
                value={stats ? `${formatCount(stats.addedLast24h)} Cells` : '—'}
                caption="Last 24 hours"
                captionIcon="access-time"
                icon="schedule"
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <SearchBar value={query} onChangeText={setQuery} placeholder="Search Cell ID or Serial No..." />
              </View>
              <Pressable
                testID="open-filters"
                accessibilityRole="button"
                accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
                onPress={() => setFiltersOpen(true)}
                style={({ pressed }) => [
                  {
                    width: 52,
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.xl,
                    borderWidth: activeFilterCount > 0 ? 1.5 : 1,
                    borderColor: activeFilterCount > 0 ? colors.turnoOrange : colors.slate200,
                    backgroundColor: activeFilterCount > 0 ? colors.orange50 : pressed ? colors.slate50 : colors.surface,
                  },
                  shadows.card,
                ]}
              >
                <Icon name="tune" size={22} color={activeFilterCount > 0 ? colors.turnoOrange : colors.slate700} />
                {activeFilterCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      minWidth: 20,
                      height: 20,
                      paddingHorizontal: 5,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.turnoOrange,
                      borderWidth: 2,
                      borderColor: colors.background,
                    }}
                  >
                    <AppText variant="labelSm" color="#FFFFFF" style={{ fontSize: 10, lineHeight: 12 }}>
                      {activeFilterCount}
                    </AppText>
                  </View>
                ) : null}
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <AppText variant="overline" color={colors.slate600} style={{ fontSize: 12 }}>
                Registered Batch Registry
              </AppText>
            </View>
          </View>
        }
        ListEmptyComponent={
          state === 'loading' ? (
            <LoadingState label="Loading cells..." />
          ) : state === 'error' ? (
            <MessageState
              tone="danger"
              icon="cloud-off"
              title="Could not load cells"
              message={error ?? 'Please check your connection and try again.'}
              actionLabel="Retry"
              onAction={retry}
            />
          ) : searching ? (
            <MessageState
              icon="search-off"
              title="No matching cells"
              message={
                query.trim().length > 0
                  ? `Nothing matches “${query.trim()}”${filtersActive ? ' with the selected filters' : ''}. Try a different barcode or serial number.`
                  : 'No cells match the selected filters.'
              }
              actionLabel="Clear search and filters"
              onAction={clearAll}
            />
          ) : (
            <MessageState
              icon="inventory-2"
              title="No cells registered yet"
              message={canWrite ? 'Scan a battery cell to register it. It will appear here.' : 'No battery cells have been registered yet.'}
              actionLabel={canWrite ? 'Scan a cell' : undefined}
              onAction={canWrite ? () => router.navigate('/(tabs)/scan') : undefined}
            />
          )
        }
      />

      <FilterSheet
        visible={filtersOpen}
        filters={{ manufacturer, status: statusFilter }}
        onApply={(next) => {
          setManufacturer(next.manufacturer);
          setStatus(next.status);
          setFiltersOpen(false);
        }}
        onReset={() => {
          setManufacturer(null);
          setStatus(null);
          setFiltersOpen(false);
        }}
        onClose={() => setFiltersOpen(false)}
      />
    </KeyboardAvoider>
  );
}
