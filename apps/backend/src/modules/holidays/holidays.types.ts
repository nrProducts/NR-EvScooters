export interface Holiday {
    id: string;
    name: string;
    holiday_date: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
}

export interface CreateHolidayInput {
    name: string;
    holiday_date: string;
    description?: string;
    is_active?: boolean;
}

export interface UpdateHolidayInput {
    name?: string;
    holiday_date?: string;
    description?: string | null;
    is_active?: boolean;
}

export interface ListHolidayFilters {
    page: number;
    pageSize: number;
    /** Only holidays on or after today (businessToday()). */
    upcoming?: boolean;
}
