/**
 * TanStack Query hooks over the rider HTTP surface. The web app already mounts
 * a QueryClientProvider (see apps/web/src/main.tsx) with the same defaults the
 * admin console uses.
 */
import { useQuery } from "@tanstack/react-query";
import { riderApi } from "../services/riderApi";
import type { ListVehicleModelsParams } from "../types/api";

export const riderKeys = {
  kyc: ["rider", "kyc"] as const,
  currentBooking: ["rider", "booking", "current"] as const,
  currentRental: ["rider", "rental", "current"] as const,
  returnStage: ["rider", "rental", "return-stage"] as const,
  overdueLateFee: ["rider", "rental", "overdue-late-fee"] as const,
  settlement: ["rider", "rental", "settlement"] as const,
  invoices: (bookingId?: string) => ["rider", "invoices", bookingId ?? "all"] as const,
  deposit: (bookingId: string) => ["rider", "deposit", bookingId] as const,
  damages: (bookingId: string) => ["rider", "damages", bookingId] as const,
  vehicleModels: (p: ListVehicleModelsParams) => ["rider", "vehicle-models", p] as const,
  vehicleModel: (id: string) => ["rider", "vehicle-model", id] as const,
  availabilitySummary: ["rider", "vehicle-models", "availability-summary"] as const,
  notifications: ["rider", "notifications"] as const,
  unreadCount: ["rider", "notifications", "unread-count"] as const,
};

export const useMyKyc = () =>
  useQuery({ queryKey: riderKeys.kyc, queryFn: () => riderApi.myKyc() });

/**
 * `ApiMe.profile_photo_url` is a private storage PATH, not a URL — it must be
 * exchanged for a short-lived signed URL via GET /users/me/photo/url before it
 * can go in an <img src>. Signed URLs expire, so this refetches periodically.
 */
export const useMyPhotoUrl = (enabled: boolean) =>
  useQuery({
    queryKey: ["rider", "photo-url"],
    queryFn: () => riderApi.myPhotoUrl().then((r) => r.url),
    enabled,
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
  });

export const useCurrentBooking = () =>
  useQuery({ queryKey: riderKeys.currentBooking, queryFn: () => riderApi.myCurrentBooking() });

export const useCurrentRental = () =>
  useQuery({ queryKey: riderKeys.currentRental, queryFn: () => riderApi.myCurrentRental() });

export const useReturnStage = (enabled = true) =>
  useQuery({ queryKey: riderKeys.returnStage, queryFn: () => riderApi.myReturnStage(), enabled });

export const useOverdueLateFee = (enabled = true) =>
  useQuery({ queryKey: riderKeys.overdueLateFee, queryFn: () => riderApi.myOverdueLateFee(), enabled });

export const useSettlement = (enabled = true) =>
  useQuery({ queryKey: riderKeys.settlement, queryFn: () => riderApi.myRentalSettlement(), enabled });

export const useBookingWithPlan = (bookingId: string | undefined) =>
  useQuery({
    queryKey: ["rider", "booking-with-plan", bookingId ?? ""],
    queryFn: () => riderApi.myBookingById(bookingId as string),
    enabled: !!bookingId,
  });

export const useMyInvoices = (bookingId?: string) =>
  useQuery({
    queryKey: riderKeys.invoices(bookingId),
    queryFn: () => riderApi.myInvoices(bookingId ? { bookingId, pageSize: 50 } : { pageSize: 50 }),
  });

export const useDeposit = (bookingId: string | undefined) =>
  useQuery({
    queryKey: riderKeys.deposit(bookingId ?? ""),
    queryFn: () => riderApi.myDepositForBooking(bookingId as string),
    enabled: !!bookingId,
  });

export const useDamages = (bookingId: string | undefined) =>
  useQuery({
    queryKey: riderKeys.damages(bookingId ?? ""),
    queryFn: () => riderApi.myDamagesForBooking(bookingId as string),
    enabled: !!bookingId,
  });

export const useVehicleModels = (params: ListVehicleModelsParams) =>
  useQuery({
    queryKey: riderKeys.vehicleModels(params),
    queryFn: () => riderApi.listVehicleModels(params),
  });

export const useVehicleModel = (id: string | undefined) =>
  useQuery({
    queryKey: riderKeys.vehicleModel(id ?? ""),
    queryFn: () => riderApi.getVehicleModel(id as string),
    enabled: !!id,
  });

export const useAvailabilitySummary = () =>
  useQuery({ queryKey: riderKeys.availabilitySummary, queryFn: () => riderApi.fleetAvailabilitySummary() });

export const useMyNotifications = () =>
  useQuery({ queryKey: riderKeys.notifications, queryFn: () => riderApi.myNotifications({ pageSize: 30 }) });

export const useUnreadCount = () =>
  useQuery({
    queryKey: riderKeys.unreadCount,
    queryFn: () => riderApi.unreadNotificationCount().then((r) => r.count),
    refetchInterval: 60_000,
  });
