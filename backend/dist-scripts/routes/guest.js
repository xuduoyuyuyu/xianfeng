"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const guest_1 = require("../controllers/guest");
const router = express_1.default.Router();
const guestController = new guest_1.GuestController();
router.get("/", (req, res) => guestController.getAllPublic(req, res));
router.get("/:id", (req, res) => guestController.getByIdPublic(req, res));
router.post("/:id/return-wish", (req, res) => guestController.addReturnWish(req, res));
exports.default = router;
