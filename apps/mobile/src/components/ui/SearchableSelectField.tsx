import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { Search, ChevronDown, Check } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { Sheet } from './Sheet';
import { useT } from '../../i18n';

interface Option {
  key: string;
  label: string;
}

interface SearchableSelectFieldProps {
  label: string;
  options: readonly Option[];
  /** The selected option's label (this field stores free text, matching what's persisted). */
  value: string;
  onChange: (label: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
}

/**
 * A FormField-styled trigger that opens a bottom sheet with a search box and
 * a scrollable list — for option lists too long for ChipSelect's pill row
 * (e.g. all 36 Indian states/UTs).
 */
export const SearchableSelectField: React.FC<SearchableSelectFieldProps> = ({
  label, options, value, onChange, required, error, placeholder,
}) => {
  const { t } = useT();
  const resolvedPlaceholder = placeholder ?? t('ui.selectPlaceholder');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const openSheet = () => {
    setQuery('');
    setOpen(true);
  };

  const pick = (opt: Option) => {
    onChange(opt.label);
    setOpen(false);
  };

  return (
    <View className="mb-3.5">
      <View className="flex-row items-center mb-1.5">
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider">
          {label}
        </Text>
        {required ? <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1">*</Text> : null}
      </View>

      <TouchableOpacity
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-row items-center justify-between rounded-xl px-3.5 py-3 border"
        style={{
          backgroundColor: COLORS.background,
          borderColor: error ? COLORS.danger : COLORS.border,
        }}
      >
        <Text
          style={{ color: value ? COLORS.textPrimary : COLORS.textSecondary }}
          className="text-sm font-semibold flex-1"
          numberOfLines={1}
        >
          {value || resolvedPlaceholder}
        </Text>
        <ChevronDown size={16} color={COLORS.textSecondary} />
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mt-1.5">
          {error}
        </Text>
      ) : null}

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View className="px-6 pb-2">
          <View
            className="flex-row items-center rounded-xl px-3.5 py-2.5 border mb-3"
            style={{ backgroundColor: COLORS.background, borderColor: COLORS.border }}
          >
            <Search size={16} color={COLORS.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('ui.searchPlaceholder')}
              placeholderTextColor={COLORS.textSecondary}
              autoFocus
              accessibilityLabel={t('ui.searchLabelFor', { field: label })}
              className="flex-1 text-sm font-semibold ml-2.5"
              style={{ color: COLORS.textPrimary }}
            />
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          style={{ maxHeight: 340 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ color: COLORS.textSecondary }} className="text-xs font-medium text-center py-6">
              {t('common.noMatches')}
            </Text>
          }
          renderItem={({ item }) => {
            const selected = item.label === value;
            return (
              <TouchableOpacity
                onPress={() => pick(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className="flex-row items-center justify-between py-3 border-b"
                style={{ borderColor: COLORS.border }}
              >
                <Text
                  style={{ color: selected ? COLORS.primary : COLORS.textPrimary }}
                  className={`text-sm ${selected ? 'font-bold' : 'font-semibold'}`}
                >
                  {item.label}
                </Text>
                {selected ? <Check size={16} color={COLORS.primary} /> : null}
              </TouchableOpacity>
            );
          }}
        />
      </Sheet>
    </View>
  );
};
