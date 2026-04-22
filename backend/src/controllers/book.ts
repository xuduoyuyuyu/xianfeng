import { Request, Response } from "express";
import Book from "../models/Book";

function statusUpdatePayload(status: "draft" | "published") {
  if (status === "published") {
    return { status, publishedAt: new Date() };
  }
  return { status, publishedAt: null };
}

export class BookController {
  async getAllPublic(_req: Request, res: Response): Promise<void> {
    try {
      const books = await Book.find({ status: "published" }).sort({
        publishedAt: -1,
      });
      res.status(200).json(books);
    } catch (error) {
      res.status(500).json({ message: "获取书单列表失败", error });
    }
  }

  async getByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findOne({ _id: id, status: "published" });
      if (!book) {
        res.status(404).json({ message: "书籍不存在或未上架" });
        return;
      }
      res.status(200).json(book);
    } catch (error) {
      res.status(500).json({ message: "获取书籍失败", error });
    }
  }

  async getAllAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query;
      const filter =
        status === "draft" || status === "published" ? { status } : {};
      const books = await Book.find(filter).sort({ updatedAt: -1 });
      res.status(200).json(books);
    } catch (error) {
      res.status(500).json({ message: "获取管理书单失败", error });
    }
  }

  async getByIdAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findById(id);
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json(book);
    } catch (error) {
      res.status(500).json({ message: "获取书籍失败", error });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const payload = req.body;
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      const book = new Book(payload);
      await book.save();
      res.status(201).json(book);
    } catch (error) {
      res.status(400).json({ message: "创建书籍失败", error });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const payload = req.body;
      if (payload.status && !["draft", "published"].includes(payload.status)) {
        res.status(400).json({ message: "无效的状态值" });
        return;
      }
      if (payload.status === "published" && !payload.publishedAt) {
        payload.publishedAt = new Date();
      }
      if (payload.status === "draft") {
        payload.publishedAt = null;
      }
      const book = await Book.findByIdAndUpdate(id, payload, { new: true });
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json(book);
    } catch (error) {
      res.status(400).json({ message: "更新书籍失败", error });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (status !== "draft" && status !== "published") {
        res.status(400).json({ message: "状态仅允许 draft 或 published" });
        return;
      }
      const book = await Book.findByIdAndUpdate(id, statusUpdatePayload(status), {
        new: true,
      });
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json(book);
    } catch (error) {
      res.status(400).json({ message: "更新书籍状态失败", error });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const book = await Book.findByIdAndDelete(id);
      if (!book) {
        res.status(404).json({ message: "书籍不存在" });
        return;
      }
      res.status(200).json({ message: "书籍删除成功" });
    } catch (error) {
      res.status(500).json({ message: "删除书籍失败", error });
    }
  }
}
