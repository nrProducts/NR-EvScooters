import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, ChevronLeft, X } from 'lucide-react-native';
import { COLORS } from '../../constants/theme';
import { INTL_LOCALE_TAG, useT } from '../../i18n';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChangeText: (iso: string) => void;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Oldest/most recent selectable year. Defaults to an 18-120 year age range. */
  minYear?: number;
  maxYear?: number;
}

type PickerStep = 'year' | 'month' | 'day';

/**
 * Generated from `Intl.DateTimeFormat`, keyed to the APP's language rather
 * than the device region — so switching to Tamil shows Tamil month names
 * without a 12-entry translation key per language, and a rider in a
 * different timezone/region still sees the picker in the language they
 * chose, not their device's regional format. Reference year/dates are
 * arbitrary (any month/week works) since only the localised NAME is read.
 */
function monthLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2024, i, 1)));
}

function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  // 2024-01-07 is a Sunday — the grid below assumes a Sun-first week.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Digits typed by the rider -> live YYYY-MM-DD as they go, no separators to type themselves. */
function formatTyped(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  let out = y;
  if (m) out += `-${m}`;
  if (d) out += `-${d}`;
  return out;
}

/**
 * Text input with live YYYY-MM-DD auto-formatting, plus a calendar icon that
 * opens a fast Year -> Month -> Day picker (a plain month-grid calendar would
 * mean dozens of "previous month" taps to reach a birth year decades back).
 */
export const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label, value, onChangeText, required, error, hint,
  minYear = new Date().getFullYear() - 120,
  maxYear = new Date().getFullYear() - 18,
}) => {
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const MONTH_LABELS = useMemo(() => monthLabels(INTL_LOCALE_TAG[lang]), [lang]);
  const WEEKDAY_LABELS = useMemo(() => weekdayLabels(INTL_LOCALE_TAG[lang]), [lang]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [step, setStep] = useState<PickerStep>('year');
  const [pendingYear, setPendingYear] = useState<number | null>(null);
  const [pendingMonth, setPendingMonth] = useState<number | null>(null);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = maxYear; y >= minYear; y--) list.push(y);
    return list;
  }, [minYear, maxYear]);

  const openPicker = () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
      setPendingYear(Number(m[1]));
      setPendingMonth(Number(m[2]) - 1);
      setStep('day');
    } else {
      setPendingYear(null);
      setPendingMonth(null);
      setStep('year');
    }
    setPickerOpen(true);
  };

  const pickYear = (y: number) => {
    setPendingYear(y);
    setStep('month');
  };
  const pickMonth = (m: number) => {
    setPendingMonth(m);
    setStep('day');
  };
  const pickDay = (d: number) => {
    if (pendingYear == null || pendingMonth == null) return;
    onChangeText(`${pendingYear}-${String(pendingMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    setPickerOpen(false);
  };

  const dayGrid = useMemo(() => {
    if (pendingYear == null || pendingMonth == null) return [];
    const total = daysInMonth(pendingYear, pendingMonth);
    const firstDow = new Date(pendingYear, pendingMonth, 1).getDay();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    return cells;
  }, [pendingYear, pendingMonth]);

  const selectedIso =
    pendingYear != null && pendingMonth != null
      ? `${pendingYear}-${String(pendingMonth + 1).padStart(2, '0')}-`
      : null;

  return (
    <View className="mb-3.5">
      <View className="flex-row items-center mb-1.5">
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-bold uppercase tracking-wider">
          {label}
        </Text>
        {required ? <Text style={{ color: COLORS.danger }} className="text-[11px] font-bold ml-1">*</Text> : null}
      </View>

      <View
        className="flex-row items-center rounded-xl border"
        style={{ backgroundColor: COLORS.background, borderColor: error ? COLORS.danger : COLORS.border }}
      >
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(formatTyped(v))}
          placeholder={t('datePicker.placeholder')}
          placeholderTextColor={COLORS.textSecondary}
          keyboardType="number-pad"
          accessibilityLabel={label}
          className="flex-1 px-3.5 py-3 text-sm font-semibold"
          style={{ color: COLORS.textPrimary }}
          maxLength={10}
        />
        <TouchableOpacity
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={t('datePicker.openCalendar')}
          className="px-3.5 py-3"
        >
          <Calendar size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <Text style={{ color: COLORS.danger }} className="text-[11px] font-semibold mt-1.5">{error}</Text>
      ) : hint ? (
        <Text style={{ color: COLORS.textSecondary }} className="text-[11px] font-medium mt-1.5">{hint}</Text>
      ) : null}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 16 + insets.bottom, maxHeight: '70%' }}>
            <View className="flex-row items-center justify-between mb-4">
              <TouchableOpacity
                onPress={() => {
                  if (step === 'day') setStep('month');
                  else if (step === 'month') setStep('year');
                  else setPickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('datePicker.back')}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <ChevronLeft size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={{ color: COLORS.textPrimary }} className="text-sm font-extrabold">
                {step === 'year' ? t('datePicker.selectYear') : step === 'month' ? String(pendingYear) : `${MONTH_LABELS[pendingMonth ?? 0]} ${pendingYear}`}
              </Text>
              <TouchableOpacity
                onPress={() => setPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('datePicker.close')}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: COLORS.background }}
              >
                <X size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            {step === 'year' ? (
              <FlatList
                data={years}
                keyExtractor={(y) => String(y)}
                numColumns={4}
                renderItem={({ item: y }) => (
                  <TouchableOpacity
                    onPress={() => pickYear(y)}
                    accessibilityRole="button"
                    className="flex-1 m-1 py-3 rounded-xl items-center"
                    style={{ backgroundColor: y === pendingYear ? COLORS.primary + '14' : COLORS.background }}
                  >
                    <Text
                      style={{ color: y === pendingYear ? COLORS.primary : COLORS.textPrimary }}
                      className="text-xs font-bold"
                    >
                      {y}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            ) : step === 'month' ? (
              <View className="flex-row flex-wrap">
                {MONTH_LABELS.map((label, i) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => pickMonth(i)}
                    accessibilityRole="button"
                    style={{ width: '25%', padding: 4 }}
                  >
                    <View
                      className="py-3 rounded-xl items-center"
                      style={{ backgroundColor: i === pendingMonth ? COLORS.primary + '14' : COLORS.background }}
                    >
                      <Text
                        style={{ color: i === pendingMonth ? COLORS.primary : COLORS.textPrimary }}
                        className="text-xs font-bold"
                      >
                        {label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View>
                <View className="flex-row mb-1">
                  {WEEKDAY_LABELS.map((d, i) => (
                    <View key={`${d}-${i}`} style={{ width: `${100 / 7}%` }} className="items-center py-1">
                      <Text style={{ color: COLORS.textSecondary }} className="text-[10px] font-bold">{d}</Text>
                    </View>
                  ))}
                </View>
                <View className="flex-row flex-wrap">
                  {dayGrid.map((d, i) => {
                    const iso = d != null ? `${selectedIso}${String(d).padStart(2, '0')}` : null;
                    const selected = iso != null && iso === value;
                    return (
                      <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-1">
                        {d != null ? (
                          <TouchableOpacity
                            onPress={() => pickDay(d)}
                            accessibilityRole="button"
                            className="w-8 h-8 rounded-full items-center justify-center"
                            style={{ backgroundColor: selected ? COLORS.primary : 'transparent' }}
                          >
                            <Text
                              style={{ color: selected ? COLORS.white : COLORS.textPrimary }}
                              className="text-xs font-semibold"
                            >
                              {d}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};
