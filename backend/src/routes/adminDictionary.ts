import { Router } from "express";
import { AdminDictionaryController } from "../controllers/adminDictionary";

const router = Router();
const controller = new AdminDictionaryController();

router.get("/", (req, res) => controller.getAll(req, res));
router.get("/:id", (req, res) => controller.getById(req, res));
router.post("/", (req, res) => controller.create(req, res));
router.put("/:id", (req, res) => controller.update(req, res));
router.patch("/:id/status", (req, res) => controller.updateStatus(req, res));
router.post("/import-from-programs", (req, res) => controller.importFromPrograms(req, res));
router.get("/:id/programs", (req, res) => controller.getPrograms(req, res));

export default router;
