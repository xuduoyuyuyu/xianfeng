import express from "express";
import { LearningMaterialController } from "../controllers/learningMaterial";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const learningMaterialController = new LearningMaterialController();

router.use(authenticate, requireAdmin);
router.get("/", learningMaterialController.getAllAdmin);
router.get("/:id", learningMaterialController.getByIdAdmin);
router.post("/", learningMaterialController.create);
router.put("/:id", learningMaterialController.update);
router.patch("/:id/status", learningMaterialController.updateStatus);
router.delete("/:id", learningMaterialController.delete);

export default router;
