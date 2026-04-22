import express from "express";
import { BookController } from "../controllers/book";
import { authenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const bookController = new BookController();

router.use(authenticate, requireAdmin);
router.get("/", bookController.getAllAdmin);
router.get("/:id", bookController.getByIdAdmin);
router.post("/", bookController.create);
router.put("/:id", bookController.update);
router.patch("/:id/status", bookController.updateStatus);
router.delete("/:id", bookController.delete);

export default router;
