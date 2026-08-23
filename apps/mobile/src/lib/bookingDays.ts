/**
 * Shared start-day rules for the booking flow — mirrors
 * apps/backend/src/modules/bookings/bookings.service.ts's isValidStartDay
 * exactly (Sunday and past dates are not bookable), kept in sync so mock
 * mode and the real API behave identically. Pickup is always immediate
 * (today), so getToday() is what the booking screen actually uses;
 * isValidStartDay is what MockBookingRepository validates against, and
 * getNextDays backs its own tests.
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

/**
 * The soonest day a booking may actually START — today, unless today is a
 * Sunday, in which case Monday.
 *
 * There is no date picker any more: the flow sets the start day itself for
 * immediate pickup. That made Sunday unbookable in a way nothing surfaced —
 * the screen sent today's date, the backend rejected it via isValidStartDay
 * (hubs are closed Sunday), and the rider saw "Please correct the highlighted
 * fields" on a screen with no fields on it. Every Sunday, for everyone.
 *
 * Rolling forward rather than blocking, because a closed hub is a reason to
 * collect tomorrow, not a reason to refuse the booking.
 */
export function getNextBookableDay(from = new Date()): string {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    // Sunday === 0. At most one shift is ever needed.
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

/** The next `count` calendar days starting today, Sundays marked disabled. */
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
