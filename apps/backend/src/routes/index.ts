import { Router } from "express";
import vehiclesRoutes from "../modules/vehicles/vehicles.routes";
import vehicleCatalogRoutes from "../modules/vehicle-catalog/vehicle-catalog.routes";
import usersRoutes from "../modules/users/users.routes";
import authRoutes from "../modules/auth/auth.routes";
import { riderKycRouter, adminKycRouter } from "../modules/kyc/kyc.routes";
import bookingsRoutes from "../modules/bookings/bookings.routes";
import stationsRoutes from "../modules/stations/stations.routes";
import { batteryStationsRouter, adminBatteryStationsRouter } from "../modules/battery-stations/battery-stations.routes";
import { riderNotificationsRouter, adminNotificationsRouter } from "../modules/notifications/notifications.routes";
import rentalsRoutes from "../modules/rentals/rentals.routes";
import maintenanceRoutes from "../modules/maintenance/maintenance.routes";
import invoicesRoutes, { riderRouter as riderInvoicesRouter } from "../modules/invoices/invoices.routes";
import reportsRoutes from "../modules/reports/reports.routes";
import auditRoutes, { piiAccessRouter } from "../modules/audit/audit.routes";
import { riderSupportRouter, adminSupportRouter } from "../modules/support/support.routes";
import referralsRoutes from "../modules/referrals/referrals.routes";
import paymentsRoutes from "../modules/payments/payments.routes";
import plansRoutes from "../modules/plans/plans.routes";
import damagesRoutes from "../modules/damages/damages.routes";
import { adminRouter as adminDepositsRouter, riderRouter as riderDepositsRouter } from "../modules/deposits/deposits.routes";
import refundsRoutes from "../modules/refunds/refunds.routes";
import billingRoutes from "../modules/billing/billing.routes";
import reconciliationRoutes from "../modules/reconciliation/reconciliation.routes";
import revenueRoutes from "../modules/revenue/revenue.routes";
import { consentRouter, riderConsentRouter } from "../modules/consent/consent.routes";
import geocodeRoutes from "../modules/geocode/geocode.routes";
import { adminPrivacyRouter, riderPrivacyRouter } from "../modules/privacy/privacy.routes";
import notificationSettingsRoutes from "../modules/notification-settings/notification-settings.routes";
import planRenewalSettingsRoutes from "../modules/plan-renewal-settings/plan-renewal-settings.routes";
import returnRecoverySettingsRoutes from "../modules/return-recovery-settings/return-recovery-settings.routes";
import cancellationTiersRoutes from "../modules/cancellation-tiers/cancellation-tiers.routes";
import returnsRoutes from "../modules/returns/returns.routes";
import permissionsRoutes from "../modules/permissions/permissions.routes";
import attendanceRoutes from "../modules/attendance/attendance.routes";
import leaveRoutes from "../modules/leave/leave.routes";
import holidaysRoutes from "../modules/holidays/holidays.routes";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);

// Mounted before /users so "me/kyc" and "me/notifications" are matched by
// their own routers rather than falling through to /users/:id.
router.use("/users/me/kyc", riderKycRouter);
router.use("/users/me/notifications", riderNotificationsRouter);
router.use("/users/me/support", riderSupportRouter);
router.use("/users/me/consents", riderConsentRouter);
router.use("/users/me/privacy", riderPrivacyRouter);
router.use("/users", usersRoutes);
// The permission catalogue — modules, permissions and profiles. Read-only,
// and the console's replacement for the deleted permissionProfiles.ts.
router.use("/permissions", permissionsRoutes);
router.use("/kyc", adminKycRouter);
router.use("/consent", consentRouter);
router.use("/privacy", adminPrivacyRouter);
router.use("/support", adminSupportRouter);
router.use("/notifications", adminNotificationsRouter);
router.use("/vehicles", vehiclesRoutes);
// Rider-facing browse/detail catalog — distinct from /vehicles (fleet
// inventory). See vehicle-catalog.service.ts for the rationale.
router.use("/vehicle-models", vehicleCatalogRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/stations", stationsRoutes);
router.use("/geocode", geocodeRoutes);
// Battery swap stations — a separate network from /stations (pickup points).
// Mounted before the admin router so neither path can shadow the other.
router.use("/battery-stations", batteryStationsRouter);
router.use("/admin/battery-stations", adminBatteryStationsRouter);
router.use("/rentals", rentalsRoutes);
router.use("/maintenance", maintenanceRoutes);
// Mounted before /invoices, same reasoning as /users/me/kyc before /users.
router.use("/invoices/me", riderInvoicesRouter);
router.use("/invoices", invoicesRoutes);
router.use("/reports", reportsRoutes);
router.use("/revenue", revenueRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/pii-access", piiAccessRouter);
router.use("/referrals", referralsRoutes);
router.use("/payments", paymentsRoutes);
router.use("/plans", plansRoutes);
router.use("/damages", damagesRoutes);
// Mounted before /deposits, same reasoning as /users/me/kyc before /users:
// the admin router's requireStaff would otherwise swallow every rider request.
router.use("/deposits/me", riderDepositsRouter);
router.use("/deposits", adminDepositsRouter);
router.use("/refunds", refundsRoutes);
router.use("/notification-settings", notificationSettingsRoutes);
router.use("/plan-renewal-settings", planRenewalSettingsRoutes);
router.use("/return-recovery-settings", returnRecoverySettingsRoutes);
router.use("/cancellation-tiers", cancellationTiersRoutes);
router.use("/returns", returnsRoutes);
router.use("/billing", billingRoutes);
router.use("/reconciliation", reconciliationRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/leave", leaveRoutes);
router.use("/holidays", holidaysRoutes);

export default router;
