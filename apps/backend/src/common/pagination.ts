import { Paginated } from "../types";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageParams { page: number; pageSize: number }

/** Inclusive [from, to] range for PostgREST's .range(). */
export const toRange = ({ page, pageSize }: PageParams): [number, number] => {
    const from = (page - 1) * pageSize;
    return [from, from + pageSize - 1];
};

export function paginate<T>(data: T[], total: number, { page, pageSize }: PageParams): Paginated<T> {
    return {
        data,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
        },
    };
}
