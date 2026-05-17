import fs from "fs";
import path from "path";

export interface BotConfig {
  name: string;
  description: string;
  persona: string;
  channels: Record<string, unknown>;
  model: string | null;
  auto_start?: boolean;
}

export interface BotRuntime {
  running: boolean;
  startedAt: string | null;
  history: Array<{ role: "user" | "assistant"; content: string; ts: string }>;
}

const BOT_FILES = ["SOUL.md", "USER.md", "TOOLS.md", "AGENTS.md", "HEARTBEAT.md"] as const;
const SOULS_DIR = "_souls";

const TEMPLATE_FILES: Record<string, string> = {
  "SOUL.md": `# Soul\n\nI am TutorBot, a personal AI assistant.\n\n## Personality\n\n- Helpful and friendly\n- Concise and to the point\n- Curious and eager to learn\n\n## Values\n\n- Accuracy over speed\n- User privacy and safety\n- Transparency in actions\n\n## Communication Style\n\n- Be clear and direct\n- Explain reasoning when helpful\n- Ask clarifying questions when needed\n`,
  "USER.md": `# User Profile\n\nInformation about the user to help personalize interactions.\n\n## Basic Information\n\n- **Name**: (your name)\n- **Timezone**: (your timezone, e.g., UTC+8)\n- **Language**: (preferred language)\n\n## Preferences\n\n### Communication Style\n\n- [ ] Casual\n- [ ] Professional\n- [ ] Technical\n\n### Response Length\n\n- [ ] Brief and concise\n- [ ] Detailed explanations\n- [ ] Adaptive based on question\n\n### Technical Level\n\n- [ ] Beginner\n- [ ] Intermediate\n- [ ] Expert\n\n## Work Context\n\n- **Primary Role**: (your role, e.g., developer, researcher)\n- **Main Projects**: (what you're working on)\n- **Tools You Use**: (IDEs, languages, frameworks)\n\n## Topics of Interest\n\n- \n- \n- \n\n## Special Instructions\n\n(Any specific instructions for how the assistant should behave)\n`,
  "TOOLS.md": `# Tool Usage Notes\n\nTool signatures are provided automatically via function calling.\nThis file documents non-obvious constraints and usage patterns.\n`,
  "AGENTS.md": `# Agent Instructions\n\nYou are a helpful AI assistant. Be concise, accurate, and friendly.\n`,
  "HEARTBEAT.md": `# Heartbeat Tasks\n\nThis file is checked every 30 minutes by TutorBot.\n\n## Active Tasks\n\n<!-- Add your periodic tasks below this line -->\n\n## Completed\n\n<!-- Move completed tasks here or delete them -->\n`,
};

class TutorbotManager {
  private baseDir: string;
  private runtime = new Map<string, BotRuntime>();

  constructor() {
    this.baseDir = path.join(process.cwd(), "data", "tutorbot");
    fs.mkdirSync(this.baseDir, { recursive: true });
    this.ensureSoulsDir();
  }

  private ensureSoulsDir(): string {
    const dir = path.join(this.baseDir, SOULS_DIR);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private botDir(botId: string): string {
    return path.join(this.baseDir, botId);
  }

  private workspaceDir(botId: string): string {
    return path.join(this.botDir(botId), "workspace");
  }

  private configPath(botId: string): string {
    return path.join(this.botDir(botId), "config.json");
  }

  private ensureBotDirs(botId: string): void {
    const ws = this.workspaceDir(botId);
    fs.mkdirSync(ws, { recursive: true });
    for (const file of BOT_FILES) {
      const filePath = path.join(ws, file);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, TEMPLATE_FILES[file] || "", "utf-8");
      }
    }
  }

  private readConfig(botId: string): BotConfig | null {
    const p = this.configPath(botId);
    if (!fs.existsSync(p)) return null;
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      return {
        name: raw.name || botId,
        description: raw.description || "",
        persona: raw.persona || "",
        channels: raw.channels || {},
        model: raw.model || null,
        auto_start: !!raw.auto_start,
      };
    } catch {
      return null;
    }
  }

  private writeConfig(botId: string, cfg: BotConfig): void {
    fs.mkdirSync(this.botDir(botId), { recursive: true });
    fs.writeFileSync(this.configPath(botId), JSON.stringify(cfg, null, 2), "utf-8");
  }

  private getRuntime(botId: string): BotRuntime {
    if (!this.runtime.has(botId)) {
      this.runtime.set(botId, { running: false, startedAt: null, history: [] });
    }
    return this.runtime.get(botId)!;
  }

  listBots() {
    const dirs = fs
      .readdirSync(this.baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== SOULS_DIR)
      .map((d) => d.name);
    return dirs
      .map((botId) => {
        const cfg = this.readConfig(botId);
        if (!cfg) return null;
        const rt = this.getRuntime(botId);
        return {
          bot_id: botId,
          name: cfg.name,
          description: cfg.description,
          persona: cfg.persona,
          channels: Object.keys(cfg.channels || {}),
          model: cfg.model,
          running: rt.running,
          started_at: rt.startedAt,
        };
      })
      .filter(Boolean);
  }

  startBot(botId: string, incoming?: Partial<BotConfig> & { name?: string }) {
    this.ensureBotDirs(botId);
    const prev = this.readConfig(botId);
    const next: BotConfig = {
      name: incoming?.name || prev?.name || botId,
      description: incoming?.description ?? prev?.description ?? "",
      persona: incoming?.persona ?? prev?.persona ?? "",
      channels: incoming?.channels ?? prev?.channels ?? {},
      model: incoming?.model ?? prev?.model ?? null,
      auto_start: true,
    };
    this.writeConfig(botId, next);

    const ws = this.workspaceDir(botId);
    const soulPath = path.join(ws, "SOUL.md");
    if (next.persona && (!fs.existsSync(soulPath) || !fs.readFileSync(soulPath, "utf-8").trim())) {
      fs.writeFileSync(soulPath, next.persona, "utf-8");
    }

    const rt = this.getRuntime(botId);
    rt.running = true;
    rt.startedAt = new Date().toISOString();

    return {
      bot_id: botId,
      name: next.name,
      description: next.description,
      persona: next.persona,
      channels: Object.keys(next.channels || {}),
      model: next.model,
      running: true,
      started_at: rt.startedAt,
    };
  }

  stopBot(botId: string): boolean {
    if (!this.readConfig(botId)) return false;
    const rt = this.getRuntime(botId);
    if (!rt.running) return false;
    rt.running = false;
    return true;
  }

  destroyBot(botId: string): boolean {
    const dir = this.botDir(botId);
    if (!fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    this.runtime.delete(botId);
    return true;
  }

  getBot(botId: string) {
    const cfg = this.readConfig(botId);
    if (!cfg) return null;
    const rt = this.getRuntime(botId);
    return {
      bot_id: botId,
      name: cfg.name,
      description: cfg.description,
      persona: cfg.persona,
      channels: Object.keys(cfg.channels || {}),
      model: cfg.model,
      running: rt.running,
      started_at: rt.startedAt,
    };
  }

  getRecentActiveBots(limit = 3) {
    return this.listBots()
      .filter((b: any) => !!b.running || !!b.started_at)
      .sort((a: any, b: any) => String(b.started_at || "").localeCompare(String(a.started_at || "")))
      .slice(0, limit)
      .map((b: any) => {
        const rt = this.getRuntime(String(b.bot_id));
        const last = rt.history[rt.history.length - 1];
        return { ...b, last_message_preview: last?.content || "" };
      });
  }

  readAllBotFiles(botId: string): Record<string, string> {
    this.ensureBotDirs(botId);
    const ws = this.workspaceDir(botId);
    const out: Record<string, string> = {};
    for (const file of BOT_FILES) {
      out[file] = fs.existsSync(path.join(ws, file)) ? fs.readFileSync(path.join(ws, file), "utf-8") : "";
    }
    return out;
  }

  readBotFile(botId: string, filename: string): string | null {
    if (!BOT_FILES.includes(filename as any)) return null;
    this.ensureBotDirs(botId);
    return fs.readFileSync(path.join(this.workspaceDir(botId), filename), "utf-8");
  }

  writeBotFile(botId: string, filename: string, content: string): boolean {
    if (!BOT_FILES.includes(filename as any)) return false;
    this.ensureBotDirs(botId);
    fs.writeFileSync(path.join(this.workspaceDir(botId), filename), content ?? "", "utf-8");
    return true;
  }

  getBotHistory(botId: string, limit = 100) {
    const rt = this.getRuntime(botId);
    return rt.history.slice(-Math.max(1, limit));
  }

  appendHistory(botId: string, role: "user" | "assistant", content: string) {
    const rt = this.getRuntime(botId);
    rt.history.push({ role, content, ts: new Date().toISOString() });
    if (rt.history.length > 2000) rt.history = rt.history.slice(-2000);
  }

  listSouls() {
    const dir = this.ensureSoulsDir();
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const p = path.join(dir, f);
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  getSoul(id: string) {
    const p = path.join(this.ensureSoulsDir(), `${id}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  }

  createSoul(id: string, name: string, content: string) {
    const p = path.join(this.ensureSoulsDir(), `${id}.json`);
    if (fs.existsSync(p)) return null;
    const soul = { id, name, content };
    fs.writeFileSync(p, JSON.stringify(soul, null, 2), "utf-8");
    return soul;
  }

  updateSoul(id: string, name?: string, content?: string) {
    const current = this.getSoul(id);
    if (!current) return null;
    const next = {
      id,
      name: name ?? current.name,
      content: content ?? current.content,
    };
    fs.writeFileSync(path.join(this.ensureSoulsDir(), `${id}.json`), JSON.stringify(next, null, 2), "utf-8");
    return next;
  }

  deleteSoul(id: string) {
    const p = path.join(this.ensureSoulsDir(), `${id}.json`);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  }

  seedDefaultSouls() {
    if (this.listSouls().length > 0) return;
    this.createSoul("default", "Default", TEMPLATE_FILES["SOUL.md"]);
  }
}

export const tutorbotManager = new TutorbotManager();
tutorbotManager.seedDefaultSouls();