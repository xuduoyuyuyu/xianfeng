import mongoose from "mongoose";

interface SystemSetting extends mongoose.Document {
  key: string;
  value: any;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

const SystemSetting = mongoose.model<SystemSetting>("SystemSetting", systemSettingSchema);

export default SystemSetting;
export { SystemSetting };
