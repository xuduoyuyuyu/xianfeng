import express from "express";
import { GuestController } from "../controllers/guest";

const router = express.Router();
const guestController = new GuestController();

router.get("/", (req, res) => guestController.getAllPublic(req, res));
router.get("/:id", (req, res) => guestController.getByIdPublic(req, res));

export default router;
