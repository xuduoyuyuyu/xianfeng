import mongoose from "mongoose";

type ContentStatus = "draft" | "published";

interface Book extends mongoose.Document {
  title: string;
  author: string;
  description: string;
  coverImage: string;
  category: string;
  status: ContentStatus;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    coverImage: { type: String, required: true },
    category: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Book = mongoose.model<Book>("Book", bookSchema);

export default Book;
export { Book, ContentStatus };
