import mongoose from "mongoose";

interface UserXiaowanziSync extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  childProfiles: any[];
  chatContext: any | null;
  browsingMemory: any[];
  conversationSessions: any[];
  conversationMessages: Record<string, any[]>;
  createdAt: Date;
  updatedAt: Date;
}

const userXiaowanziSyncSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    childProfiles: { type: [mongoose.Schema.Types.Mixed], default: [] },
    chatContext: { type: mongoose.Schema.Types.Mixed, default: null },
    browsingMemory: { type: [mongoose.Schema.Types.Mixed], default: [] },
    conversationSessions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    conversationMessages: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const UserXiaowanziSync = mongoose.model<UserXiaowanziSync>("UserXiaowanziSync", userXiaowanziSyncSchema);

export default UserXiaowanziSync;
export { UserXiaowanziSync };
