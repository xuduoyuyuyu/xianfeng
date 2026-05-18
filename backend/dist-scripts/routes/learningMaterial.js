"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const learningMaterial_1 = require("../controllers/learningMaterial");
const router = express_1.default.Router();
const learningMaterialController = new learningMaterial_1.LearningMaterialController();
router.get("/", learningMaterialController.getAllPublic);
router.get("/:id", learningMaterialController.getByIdPublic);
exports.default = router;
