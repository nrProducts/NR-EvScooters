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
import invoicesRoutes from "../modules/invoices/invoices.routes";
import reportsRoutes from "../modules/reports/reports.routes";
import auditRoutes from "../modules/audit/audit.routes";
import { riderSupportRouter, adminSupportRouter } from "../modules/support/support.routes";
import referralsRoutes from "../modules/referrals/referrals.routes";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);

// Mounted before /users so "me/kyc" and "me/notifications" are matched by
// their own routers rather than falling through to /users/:id.
router.use("/users/me/kyc", riderKycRouter);
router.use("/users/me/notifications", riderNotificationsRouter);
router.use("/users/me/support", riderSupportRouter);
router.use("/users", usersRoutes);
router.use("/kyc", adminKycRouter);
router.use("/support", adminSupportRouter);
router.use("/notifications", adminNotificationsRouter);
router.use("/vehicles", vehiclesRoutes);
// Rider-facing browse/detail catalog — distinct from /vehicles (fleet
// inventory). See vehicle-catalog.service.ts for the rationale.
router.use("/vehicle-models", vehicleCatalogRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/stations", stationsRoutes);
// Battery swap stations — a separate network from /stations (pickup points).
// Mounted before the admin router so neither path can shadow the other.
router.use("/battery-stations", batteryStationsRouter);
router.use("/admin/battery-stations", adminBatteryStationsRouter);
router.use("/rentals", rentalsRoutes);
router.use("/maintenance", maintenanceRoutes);
router.use("/invoices", invoicesRoutes);
router.use("/reports", reportsRoutes);
router.use("/audit-logs", auditRoutes);
router.use("/referrals", referralsRoutes);

export default router;
