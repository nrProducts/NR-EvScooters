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
import ReturnDetailPage from "@/pages/returns/ReturnDetailPage";
import MaintenancePage from "@/pages/maintenance/MaintenancePage";
import SupportTicketsPage from "@/pages/support/SupportTicketsPage";
import PaymentsPage from "@/pages/payments/PaymentsPage";
import DamagesPage from "@/pages/damages/DamagesPage";
import RefundsPage from "@/pages/refunds/RefundsPage";
import BillingPage from "@/pages/billing/BillingPage";
import PlansPage from "@/pages/plans/PlansPage";
import ReconciliationPage from "@/pages/reconciliation/ReconciliationPage";
import RevenuePage from "@/pages/revenue/RevenuePage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import PermissionMatrixPage from "@/pages/settings/PermissionMatrixPage";
import NotificationManagerPage from "@/pages/settings/NotificationManagerPage";
import PiiAccessPage from "@/pages/privacy/PiiAccessPage";
import RightsQueuePage from "@/pages/privacy/RightsQueuePage";
import AuditLogPage from "@/pages/audit/AuditLogPage";
import AttendanceRouter from "@/pages/attendance/AttendanceRouter";
import LeaveRouter from "@/pages/leave/LeaveRouter";
import MyProfilePage from "@/pages/profile/MyProfilePage";
import HolidaysPage from "@/pages/holidays/HolidaysPage";
import NotFoundPage from "@/pages/errors/NotFoundPage";
import ForbiddenPage from "@/pages/errors/ForbiddenPage";

import { RiderProtectedRoute } from "./RiderProtectedRoute";
import { RiderLayout } from "@/rider/layouts/RiderLayout";
import RiderOtpPage from "@/rider/pages/RiderOtpPage";
import RiderAuthCallback from "@/rider/pages/RiderAuthCallback";
import RiderHome from "@/rider/pages/RiderHome";
import RiderProfileSetup from "@/rider/pages/RiderProfileSetup";
import RiderConsent from "@/rider/pages/RiderConsent";
import RiderKycWizard from "@/rider/pages/RiderKycWizard";
import RiderBrowseVehicles from "@/rider/pages/RiderBrowseVehicles";
import RiderBookingSelect from "@/rider/pages/RiderBookingSelect";
import RiderScooter from "@/rider/pages/RiderScooter";
import RiderBilling from "@/rider/pages/RiderBilling";
import RiderReturn from "@/rider/pages/RiderReturn";
import RiderProfile from "@/rider/pages/RiderProfile";
import RiderSupport from "@/rider/pages/RiderSupport";
import RiderNotifications from "@/rider/pages/RiderNotifications";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        {/* Rider phone-OTP verification — same centered-card chrome as /login. */}
        <Route path="/login/otp" element={<RiderOtpPage />} />
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
        {/* Returns no longer has its own list page — the full return-review
            workflow (Return Requests/Recovery/Settled) now lives inside
            Rental Operations (/bookings); the detail page is nested under
            /bookings too (not a bare /returns/:id) so it's recognised as
            part of Rental Operations by nav highlighting/matchPath without
            needing a separate (and previously hidden) NAV_ITEMS entry. */}
        <Route path="/bookings" element={<BookingListPage />} />
        <Route path="/bookings/returns/:rentalId" element={<ReturnDetailPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/support" element={<SupportTicketsPage />} />

        <Route path="/revenue" element={<RevenuePage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/damages" element={<DamagesPage />} />
        <Route path="/refunds" element={<RefundsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/reconciliation" element={<ReconciliationPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/staff-access/:userId/permissions" element={<PermissionMatrixPage />} />
        <Route path="/settings/notification-manager" element={<NotificationManagerPage />} />
        <Route path="/privacy/requests" element={<RightsQueuePage />} />
        <Route path="/privacy/access-log" element={<PiiAccessPage />} />
        <Route path="/audit" element={<AuditLogPage />} />

        {/* Mini HRMS — AttendanceRouter/LeaveRouter branch by role internally
            too (see their own comments), so the two paths mounting the same
            router component can never end up wired to the wrong page. */}
        <Route path="/attendance" element={<AttendanceRouter />} />
        <Route path="/my-attendance" element={<AttendanceRouter />} />
        <Route path="/leave" element={<LeaveRouter />} />
        <Route path="/my-leave" element={<LeaveRouter />} />
        <Route path="/holidays" element={<HolidaysPage />} />
        <Route path="/my-profile" element={<MyProfilePage />} />

        <Route path="/403" element={<ForbiddenPage />} />
      </Route>

      {/* --- Rider web (/rider/*) — separate shell, own auth store, gated by
          RiderProtectedRoute (not roleConfig). Sign-in is the shared /login
          page; these are post-auth continuations. Admin/staff routes above
          are untouched. --- */}
      <Route path="/rider/login" element={<Navigate to="/login" replace />} />
      <Route path="/rider/otp" element={<Navigate to="/login" replace />} />
      <Route path="/rider/auth/callback" element={<RiderAuthCallback />} />

      {/* Onboarding steps — gated, but chrome-less (no nav drawer / top bar). */}
      <Route
        path="/rider/profile-setup"
        element={
          <RiderProtectedRoute>
            <RiderProfileSetup />
          </RiderProtectedRoute>
        }
      />
      <Route
        path="/rider/consent"
        element={
          <RiderProtectedRoute>
            <RiderConsent />
          </RiderProtectedRoute>
        }
      />

      <Route
        element={
          <RiderProtectedRoute>
            <RiderLayout />
          </RiderProtectedRoute>
        }
      >
        <Route path="/rider" element={<RiderHome />} />
        <Route path="/rider/kyc" element={<RiderKycWizard />} />
        <Route path="/rider/browse" element={<RiderBrowseVehicles />} />
        <Route path="/rider/booking/:modelId" element={<RiderBookingSelect />} />
        <Route path="/rider/booking/:modelId/pay" element={<Navigate to=".." replace relative="path" />} />
        <Route path="/rider/scooter" element={<RiderScooter />} />
        <Route path="/rider/billing" element={<RiderBilling />} />
        <Route path="/rider/my-plan" element={<Navigate to="/rider/billing" replace />} />
        <Route path="/rider/return" element={<RiderReturn />} />
        <Route path="/rider/support" element={<RiderSupport />} />
        <Route path="/rider/account" element={<RiderProfile />} />
        <Route path="/rider/notifications" element={<RiderNotifications />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
