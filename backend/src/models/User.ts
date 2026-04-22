import mongoose from "mongoose";

interface User extends mongoose.Document {
  username: string;
  password: string;
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
