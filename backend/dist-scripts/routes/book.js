"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const book_1 = require("../controllers/book");
const router = express_1.default.Router();
const bookController = new book_1.BookController();
router.get("/", bookController.getAllPublic);
router.get("/:id", bookController.getByIdPublic);
exports.default = router;
