import { MOCK_BOOKINGS } from "@/services/mockData";
import type { Booking, BookingStatus } from "@/types";
import { delay, paginate } from "./client";

let bookings = [...MOCK_BOOKINGS];

export interface BookingFilters {
  status?: BookingStatus | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchBookings(filters: BookingFilters = {}) {
  const { status = "all", search = "", page = 1, pageSize = 10 } = filters;
  let result = bookings;
  if (status !== "all") result = result.filter((b) => b.status === status);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (b) => b.vehicleReg.toLowerCase().includes(q) || b.riderName.toLowerCase().includes(q),
    );
  }
  return delay(paginate(result, page, pageSize));
}

export async function cancelBooking(id: string) {
  bookings = bookings.map((b) => (b.id === id ? { ...b, status: "cancelled" as const } : b));
  return delay(bookings.find((b) => b.id === id)!);
}

export async function fetchBookingById(id: string) {
  const booking = bookings.find((b) => b.id === id);
  if (!booking) throw new Error("Booking not found");
  return delay(booking);
}
