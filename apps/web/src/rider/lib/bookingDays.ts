/**
 * Ported verbatim from apps/mobile/src/lib/bookingDays.ts — keep in sync.
 *
 * Shared start-day rules for the booking flow — mirrors
 * apps/backend/src/modules/bookings/bookings.service.ts's isValidStartDay
 * (Sunday and past dates are not bookable).
 */

const fmt = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/** Today as YYYY-MM-DD. */
export function getToday(): string {
    return fmt(new Date());
}

export function getNextBookableDay(from = new Date()): string {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return fmt(d);
}

export function isValidStartDay(dateStr: string): boolean {
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) return false;

    return parsed.getDay() !== 0;
}

export interface DayOption {
    date: string; // YYYY-MM-DD
    weekday: string; // "Mon", "Tue", ...
    dayOfMonth: number;
    disabled: boolean;
}

const WEEKDAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getNextDays(count = 14, from = new Date()): DayOption[] {
    const options: DayOption[] = [];
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);

    for (let i = 0; i < count; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        options.push({
            date: fmt(d),
            weekday: WEEKDAY_LABEL[d.getDay()],
            dayOfMonth: d.getDate(),
            disabled: d.getDay() === 0,
        });
    }

    return options;
}
