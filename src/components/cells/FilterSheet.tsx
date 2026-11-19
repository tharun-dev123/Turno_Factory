import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FilterDropdown, type FilterOption } from '@/components/ui/FilterDropdown';
import { Icon } from '@/components/ui/Icon';
import { MANUFACTURERS, VISUAL_INSPECTION_STATUSES, type Manufacturer, type VisualInspectionStatus } from '@/models/cell';
import type { CellFilters } from '@/services/cellService';
import { colors, shadows } from '@/theme';

const MANUFACTURER_OPTIONS: readonly FilterOption<Manufacturer | 'none'>[] = [
  { value: null, label: 'All manufacturers' },
  ...MANUFACTURERS.map((name) => ({ value: name, label: name })),
  { value: 'none', label: 'Not set' },
];

const STATUS_OPTIONS: readonly FilterOption<VisualInspectionStatus>[] = [
  { value: null, label: 'All statuses' },
  ...VISUAL_INSPECTION_STATUSES.map((name) => ({ value: name, label: name })),
];

export interface FilterSheetProps {
  visible: boolean;
  /** The filters currently applied to the list */
  filters: CellFilters;
  onApply: (filters: CellFilters) => void;
  /** Clear both filters */
  onReset: () => void;
  onClose: () => void;
}

/**
 * Bottom sheet with the Manufacturer and Cell Status filters. Choices are only a draft until "Apply Filters" is
 * pressed; closing the sheet without applying keeps the filters that were already active.
 */
export function FilterSheet({ visible, filters, onApply, onReset, onClose }: FilterSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* Mounted only while open, so each opening starts from the filters that are currently applied. */}
      {visible ? <SheetBody filters={filters} onApply={onApply} onReset={onReset} onClose={onClose} /> : null}
    </Modal>
  );
}

function SheetBody({ filters, onApply, onReset, onClose }: Omit<FilterSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [manufacturer, setManufacturer] = useState<CellFilters['manufacturer']>(filters.manufacturer);
  const [status, setStatus] = useState<CellFilters['status']>(filters.status);

  return (
    <Pressable accessibilityLabel="Close filters" onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
      <Pressable
        accessible={false}
        style={[
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            // Never taller than the screen: on a small phone the fields scroll and the buttons stay in view.
            maxHeight: '88%',
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
          },
          shadows.dialog,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 }}>
          <AppText variant="headlineSm">Filter Cells</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Close filters" hitSlop={12} onPress={onClose}>
            <Icon name="close" size={22} color={colors.slate500} />
          </Pressable>
        </View>
        <View style={{ height: 1, backgroundColor: colors.slate100, marginHorizontal: 20 }} />

        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <FilterDropdown label="Manufacturer" options={MANUFACTURER_OPTIONS} value={manufacturer} onChange={setManufacturer} testID="filter-manufacturer" />
          <FilterDropdown label="Cell Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} testID="filter-status" />
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 4 }}>
          <Button label="Reset" variant="outline" onPress={onReset} style={{ flex: 1 }} testID="filter-reset" />
          <Button label="Apply Filters" onPress={() => onApply({ manufacturer, status })} style={{ flex: 1.3 }} testID="filter-apply" />
        </View>
      </Pressable>
    </Pressable>
  );
}
