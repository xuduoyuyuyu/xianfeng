import express from "express";
import { BookController } from "../controllers/book";

const router = express.Router();
const bookController = new BookController();

router.get("/", bookController.getAllPublic);
router.get("/external", bookController.getExternalLibraryPublic);
router.get("/external/:id", bookController.getExternalBookPublic);
router.post("/external/:id/description-translation", bookController.getExternalBookDescriptionTranslationPublic);
router.get("/proxy-image", bookController.proxyImage);
router.get("/:id/metadata", bookController.getMetadataPublic);
router.get("/:id", bookController.getByIdPublic);

export default router;
