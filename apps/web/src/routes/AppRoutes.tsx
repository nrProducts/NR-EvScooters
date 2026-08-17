import { Routes, Route, Navigate } from "react-router-dom";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ProtectedRoute } from "./ProtectedRoute";

import LoginPage from "@/pages/auth/LoginPage";
import SignUpPage from "@/pages/auth/SignUpPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage";
import DashboardRouter from "@/pages/dashboard/DashboardRouter";
import BatteryStationsPage from "@/pages/battery-stations/BatteryStationsPage";
import VehicleListPage from "@/pages/vehicles/VehicleListPage";
import VehicleDetailPage from "@/pages/vehicles/VehicleDetailPage";
import UserListPage from "@/pages/users/UserListPage";
import UserDetailPage from "@/pages/users/UserDetailPage";
import KycQueuePage from "@/pages/kyc/KycQueuePage";
import BookingListPage from "@/pages/bookings/BookingListPage";
import MaintenancePage from "@/pages/maintenance/MaintenancePage";
import SupportTicketsPage from "@/pages/support/SupportTicketsPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import DamagesPage from "@/pages/damages/DamagesPage";
import RefundsPage from "@/pages/refunds/RefundsPage";
import BillingPage from "@/pages/billing/BillingPage";
import PlansPage from "@/pages/plans/PlansPage";
import ReconciliationPage from "@/pages/reconciliation/ReconciliationPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import PermissionMatrixPage from "@/pages/settings/PermissionMatrixPage";
import PiiAccessPage from "@/pages/privacy/PiiAccessPage";
import RightsQueuePage from "@/pages/privacy/RightsQueuePage";
import AuditLogPage from "@/pages/audit/AuditLogPage";
import NotFoundPage from "@/pages/errors/NotFoundPage";
import ForbiddenPage from "@/pages/errors/ForbiddenPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Same centered-card chrome as /login, but gated — a staff member
            forced to change their admin-issued temp password sees only this
            form, never the dashboard sidebar. */}
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePasswordPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/battery-stations" element={<BatteryStationsPage />} />

        <Route path="/vehicles" element={<VehicleListPage />} />
        <Route path="/vehicles/:id" element={<VehicleDetailPage />} />

        <Route path="/users" element={<UserListPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />

        <Route path="/kyc" element={<KycQueuePage />} />
        <Route path="/bookings" element={<BookingListPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/support" element={<SupportTicketsPage />} />

        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/damages" element={<DamagesPage />} />
        <Route path="/refunds" element={<RefundsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/reconciliation" element={<ReconciliationPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/staff-access/:userId/permissions" element={<PermissionMatrixPage />} />
        <Route path="/privacy/requests" element={<RightsQueuePage />} />
        <Route path="/privacy/access-log" element={<PiiAccessPage />} />
        <Route path="/audit" element={<AuditLogPage />} />

        <Route path="/403" element={<ForbiddenPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
