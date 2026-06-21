"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobile: { type: String, default: "", index: true },
    name: { type: String, default: "" },
    grade: { type: String, default: "" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    avatar_initial: { type: String, default: "探" },
    avatar_image: { type: String, default: "" },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    childGrade: { type: String, default: "" },
}, { timestamps: true });
const User = mongoose_1.default.model("User", userSchema);
exports.User = User;
exports.default = User;
