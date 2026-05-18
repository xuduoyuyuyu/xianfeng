"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const program_1 = require("../controllers/program");
const router = express_1.default.Router();
const programController = new program_1.ProgramController();
router.get("/", programController.getAllPublic);
router.get("/:id/related", programController.getRelatedPublic);
router.get("/:id", programController.getByIdPublic);
exports.default = router;
