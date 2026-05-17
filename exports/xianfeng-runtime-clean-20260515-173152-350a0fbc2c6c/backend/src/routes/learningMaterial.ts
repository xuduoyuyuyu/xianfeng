import express from "express";
import { LearningMaterialController } from "../controllers/learningMaterial";

const router = express.Router();
const learningMaterialController = new LearningMaterialController();

router.get("/", learningMaterialController.getAllPublic);
router.get("/:id", learningMaterialController.getByIdPublic);

export default router;
