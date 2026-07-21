import { Router } from "express";
import vehiclesRoutes from "../modules/vehicles/vehicles.routes";
import usersRoutes from "../modules/users/users.routes";
import authRoutes from "../modules/auth/auth.routes";
import { riderKycRouter, adminKycRouter } from "../modules/kyc/kyc.routes";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok" }));

router.use("/auth", authRoutes);

// Mounted before /users so "me/kyc" is matched by the rider router rather
// than falling through to /users/:id.
router.use("/users/me/kyc", riderKycRouter);
router.use("/users", usersRoutes);
router.use("/kyc", adminKycRouter);
router.use("/vehicles", vehiclesRoutes);

export default router;
