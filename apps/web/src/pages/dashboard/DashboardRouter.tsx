import { useAuthStore } from "@/store/authStore";
import AdminDashboardPage from "@/pages/dashboard/AdminDashboardPage";
import StaffDashboardPage from "@/pages/dashboard/StaffDashboardPage";

export default function DashboardRouter() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "admin" ? <AdminDashboardPage /> : <StaffDashboardPage />;
}
