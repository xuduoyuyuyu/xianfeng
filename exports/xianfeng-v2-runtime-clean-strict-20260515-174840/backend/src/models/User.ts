import mongoose from "mongoose";

interface User extends mongoose.Document {
  username: string;
  password: string;
  mobile?: string;
  name?: string;
  grade?: string;
  level?: number;
  xp?: number;
  streak?: number;
  avatar_initial?: string;
  avatar_image?: string;
  role: "admin" | "user";
  city?: string;
  region?: string;
  childGrade?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema(
  {
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
  },
  { timestamps: true }
);

const User = mongoose.model<User>("User", userSchema);

export default User;
export { User };
