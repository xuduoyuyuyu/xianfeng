"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const learningMaterial_1 = require("../controllers/learningMaterial");
const auth_1 = require("../middlewares/auth");
const requireAdmin_1 = require("../middlewares/requireAdmin");
const router = express_1.default.Router();
const learningMaterialController = new learningMaterial_1.LearningMaterialController();
router.use(auth_1.authenticate, requireAdmin_1.requireAdmin);
router.get("/", learningMaterialController.getAllAdmin);
router.get("/:id", learningMaterialController.getByIdAdmin);
router.post("/", learningMaterialController.create);
router.put("/:id", learningMaterialController.update);
router.patch("/:id/status", learningMaterialController.updateStatus);
router.delete("/:id", learningMaterialController.delete);
exports.default = router;
