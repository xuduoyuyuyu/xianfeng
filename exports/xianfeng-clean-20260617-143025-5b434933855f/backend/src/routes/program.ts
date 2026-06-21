import express from "express";
import { ProgramController } from "../controllers/program";

const router = express.Router();
const programController = new ProgramController();

router.get("/", programController.getAllPublic);
router.get("/:id/related", programController.getRelatedPublic);
router.get("/:id", programController.getByIdPublic);

export default router;
