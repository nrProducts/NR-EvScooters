import { Router } from "express";
import vehiclesRoutes from "../modules/vehicles/vehicles.routes";

const router = Router();
router.use("/vehicles", vehiclesRoutes);

export default router;