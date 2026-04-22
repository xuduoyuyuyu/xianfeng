import express from "express";
import { UserController } from "../controllers/user";
import { authenticate, optionalAuthenticate } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = express.Router();
const userController = new UserController();

router.post("/login", userController.login);
router.get("/me", authenticate, userController.me);
router.get("/", authenticate, requireAdmin, userController.getAll);
router.post("/register", optionalAuthenticate, userController.register);
router.put("/:id", authenticate, requireAdmin, userController.update);
router.delete("/:id", authenticate, requireAdmin, userController.delete);

export default router;
