import express from "express";
import { GuestController } from "../controllers/guest";
import { authenticate, optionalAuthenticate } from "../middlewares/auth";
import { requirePro } from "../middlewares/requirePro";

const router = express.Router();
const guestController = new GuestController();

router.get("/", (req, res) => guestController.getAllPublic(req, res));
router.get("/:id/agent", optionalAuthenticate, (req, res) => guestController.getAgentProfile(req, res));
router.post("/:id/agent/chat", authenticate, requirePro("guest_agent"), (req, res) => guestController.chatWithAgent(req, res));
router.get("/:id/agent/history", authenticate, (req, res) => guestController.getAgentHistory(req, res));
router.get("/:id", (req, res) => guestController.getByIdPublic(req, res));
router.post("/:id/return-wish", (req, res) => guestController.addReturnWish(req, res));
router.post("/:id/submit-wish", (req, res) => guestController.submitWish(req, res));

export default router;
