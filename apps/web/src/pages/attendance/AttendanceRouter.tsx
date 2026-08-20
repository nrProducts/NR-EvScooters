import { useAuthStore } from "@/store/authStore";
import AdminAttendancePage from "@/pages/attendance/AdminAttendancePage";
import MyAttendancePage from "@/pages/attendance/MyAttendancePage";

/**
 * Mounted at both /attendance (admin) and /my-attendance (staff) — see
 * roleConfig.ts, where the two paths are separate NAV_ITEMS entries gated by
 * roles:["admin"]/roles:["staff"] respectively. Branching here too (rather
 * than trusting the route alone) means the wrong page can never end up wired
 * under the wrong path, mirroring DashboardRouter.tsx's exact pattern.
 */
export default function AttendanceRouter() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "admin" ? <AdminAttendancePage /> : <MyAttendancePage />;
}
