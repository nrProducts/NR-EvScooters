import { Routes, Route, Navigate } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ProtectedRoute } from "./ProtectedRoute";

import LoginPage from "@/pages/auth/LoginPage";
import DashboardRouter from "@/pages/dashboard/DashboardRouter";
import LiveMonitoringPage from "@/pages/monitoring/LiveMonitoringPage";
import LiveMapPage from "@/pages/map/LiveMapPage";
import VehicleListPage from "@/pages/vehicles/VehicleListPage";
import VehicleDetailPage from "@/pages/vehicles/VehicleDetailPage";
import RiderListPage from "@/pages/riders/RiderListPage";
import RiderDetailPage from "@/pages/riders/RiderDetailPage";
import KycQueuePage from "@/pages/kyc/KycQueuePage";
import BookingListPage from "@/pages/bookings/BookingListPage";
import MaintenancePage from "@/pages/maintenance/MaintenancePage";
import SupportTicketsPage from "@/pages/support/SupportTicketsPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import NotFoundPage from "@/pages/errors/NotFoundPage";
import ForbiddenPage from "@/pages/errors/ForbiddenPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/monitoring" element={<LiveMonitoringPage />} />
        <Route path="/map" element={<LiveMapPage />} />

        <Route path="/vehicles" element={<VehicleListPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />

        <Route path="/riders" element={<RiderListPage />} />
        <Route path="/riders/:id" element={<RiderDetailPage />} />

        <Route path="/kyc" element={<KycQueuePage />} />
        <Route path="/bookings" element={<BookingListPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/support" element={<SupportTicketsPage />} />

        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="/403" element={<ForbiddenPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
