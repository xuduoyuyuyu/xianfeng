import express from "express";
import { BookController } from "../controllers/book";

const router = express.Router();
const bookController = new BookController();

router.get("/", bookController.getAllPublic);
router.get("/proxy-image", bookController.proxyImage);
router.get("/:id", bookController.getByIdPublic);

export default router;
