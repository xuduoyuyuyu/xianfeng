import bcryptjs from "bcryptjs";
import User from "../models/User";

type EnsureAdminAccountInput = {
  username: string;
  password: string;
};

type EnsureAdminAccountResult = {
  created: boolean;
  user: InstanceType<typeof User>;
};

export async function ensureAdminAccount(input: EnsureAdminAccountInput): Promise<EnsureAdminAccountResult> {
  const username = String(input.username || "").trim();
  const password = String(input.password || "").trim();

  if (!username) {
    throw new Error("username is required");
  }
  if (!password) {
    throw new Error("password is required");
  }

  const passwordHash = await bcryptjs.hash(password, 10);
  const existing = await User.findOne({ username });

  if (!existing) {
    const user = await User.create({
      username,
      password: passwordHash,
      role: "admin",
    });
    return { created: true, user };
  }

  existing.password = passwordHash;
  existing.role = "admin";
  await existing.save();
  return { created: false, user: existing };
}
