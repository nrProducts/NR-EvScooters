import type { Role, StaffUser } from "@/types";
import { delay } from "./client";

const DIRECTORY: (StaffUser & { password: string })[] = [
  { id: "u_admin", name: "Rukeshkumar", email: "admin@swapngo.in", role: "admin", password: "admin123" },
  { id: "u_staff", name: "Staff Member", email: "staff@swapngo.in", role: "staff", password: "staff123" },
];

export async function login(email: string, password: string): Promise<StaffUser> {
  const match = DIRECTORY.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  );
  if (!match) {
    await delay(null, 400);
    throw new Error("Invalid email or password");
  }
  const { password: _pw, ...user } = match;
  return delay(user, 500);
}

export const STAFF_MEMBERS: { id: string; name: string; role: Role; status: "active" | "on_leave" }[] = [
  { id: "s1", name: "Ganesh R", role: "staff", status: "active" },
  { id: "s2", name: "Priya S", role: "staff", status: "active" },
  { id: "s3", name: "Mohan V", role: "staff", status: "on_leave" },
];
