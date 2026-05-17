import { Router } from "express";
import { AdminGuestController } from "../controllers/adminGuest";

const router = Router();
const controller = new AdminGuestController();

router.get("/", (req, res) => controller.getAll(req, res));
router.get("/:id", (req, res) => controller.getById(req, res));
router.get("/:id/program-bindings", (req, res) => controller.getProgramBindings(req, res));
router.post("/", (req, res) => controller.create(req, res));
router.put("/:id", (req, res) => controller.update(req, res));
router.put("/:id/program-bindings", (req, res) => controller.updateProgramBindings(req, res));
router.patch("/:id/status", (req, res) => controller.updateStatus(req, res));
router.delete("/:id", (req, res) => controller.remove(req, res));

export default router;
