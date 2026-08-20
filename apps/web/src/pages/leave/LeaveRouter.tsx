import { useAuthStore } from "@/store/authStore";
import AdminLeavePage from "@/pages/leave/AdminLeavePage";
import MyLeavePage from "@/pages/leave/MyLeavePage";

/** Mounted at both /leave (admin) and /my-leave (staff) — see AttendanceRouter.tsx for the reasoning. */
export default function LeaveRouter() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "admin" ? <AdminLeavePage /> : <MyLeavePage />;
}
