import express from "express";
import { UserController } from "../controllers/user";
import { authenticate, optionalAuthenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const userController = new UserController();

router.post("/login", userController.login);
router.post("/sms/send-code", userController.sendMobileCode);
router.post("/auth/mobile", userController.mobileAuth);
router.post("/page-view", optionalAuthenticate, userController.trackPageView);
router.get("/me", authenticate, userController.meCompat);
router.patch("/me", authenticate, userController.patchMeCompat);
router.get("/", authenticate, requireAdmin, userController.getAll);
router.get("/portrait", authenticate, requireAdmin, userController.getPortrait);
router.post("/register", optionalAuthenticate, userController.register);
router.put("/:id", authenticate, requireAdmin, userController.update);
router.delete("/:id", authenticate, requireAdmin, userController.delete);

export default router;
