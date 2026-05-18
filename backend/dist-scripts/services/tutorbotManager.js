"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tutorbotManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const BOT_FILES = ["SOUL.md", "USER.md", "TOOLS.md", "AGENTS.md", "HEARTBEAT.md"];
const SOULS_DIR = "_souls";
const TEMPLATE_FILES = {
    "SOUL.md": `# Soul\n\nI am TutorBot, a personal AI assistant.\n\n## Personality\n\n- Helpful and friendly\n- Concise and to the point\n- Curious and eager to learn\n\n## Values\n\n- Accuracy over speed\n- User privacy and safety\n- Transparency in actions\n\n## Communication Style\n\n- Be clear and direct\n- Explain reasoning when helpful\n- Ask clarifying questions when needed\n`,
    "USER.md": `# User Profile\n\nInformation about the user to help personalize interactions.\n\n## Basic Information\n\n- **Name**: (your name)\n- **Timezone**: (your timezone, e.g., UTC+8)\n- **Language**: (preferred language)\n\n## Preferences\n\n### Communication Style\n\n- [ ] Casual\n- [ ] Professional\n- [ ] Technical\n\n### Response Length\n\n- [ ] Brief and concise\n- [ ] Detailed explanations\n- [ ] Adaptive based on question\n\n### Technical Level\n\n- [ ] Beginner\n- [ ] Intermediate\n- [ ] Expert\n\n## Work Context\n\n- **Primary Role**: (your role, e.g., developer, researcher)\n- **Main Projects**: (what you're working on)\n- **Tools You Use**: (IDEs, languages, frameworks)\n\n## Topics of Interest\n\n- \n- \n- \n\n## Special Instructions\n\n(Any specific instructions for how the assistant should behave)\n`,
    "TOOLS.md": `# Tool Usage Notes\n\nTool signatures are provided automatically via function calling.\nThis file documents non-obvious constraints and usage patterns.\n`,
    "AGENTS.md": `# Agent Instructions\n\nYou are a helpful AI assistant. Be concise, accurate, and friendly.\n`,
    "HEARTBEAT.md": `# Heartbeat Tasks\n\nThis file is checked every 30 minutes by TutorBot.\n\n## Active Tasks\n\n<!-- Add your periodic tasks below this line -->\n\n## Completed\n\n<!-- Move completed tasks here or delete them -->\n`,
};
class TutorbotManager {
    baseDir;
    runtime = new Map();
    constructor() {
        this.baseDir = path_1.default.join(process.cwd(), "data", "tutorbot");
        fs_1.default.mkdirSync(this.baseDir, { recursive: true });
        this.ensureSoulsDir();
    }
    ensureSoulsDir() {
        const dir = path_1.default.join(this.baseDir, SOULS_DIR);
        fs_1.default.mkdirSync(dir, { recursive: true });
        return dir;
    }
    botDir(botId) {
        return path_1.default.join(this.baseDir, botId);
    }
    workspaceDir(botId) {
        return path_1.default.join(this.botDir(botId), "workspace");
    }
    configPath(botId) {
        return path_1.default.join(this.botDir(botId), "config.json");
    }
    ensureBotDirs(botId) {
        const ws = this.workspaceDir(botId);
        fs_1.default.mkdirSync(ws, { recursive: true });
        for (const file of BOT_FILES) {
            const filePath = path_1.default.join(ws, file);
            if (!fs_1.default.existsSync(filePath)) {
                fs_1.default.writeFileSync(filePath, TEMPLATE_FILES[file] || "", "utf-8");
            }
        }
    }
    readConfig(botId) {
        const p = this.configPath(botId);
        if (!fs_1.default.existsSync(p))
            return null;
        try {
            const raw = JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
            return {
                name: raw.name || botId,
                description: raw.description || "",
                persona: raw.persona || "",
                channels: raw.channels || {},
                model: raw.model || null,
                auto_start: !!raw.auto_start,
            };
        }
        catch {
            return null;
        }
    }
    writeConfig(botId, cfg) {
        fs_1.default.mkdirSync(this.botDir(botId), { recursive: true });
        fs_1.default.writeFileSync(this.configPath(botId), JSON.stringify(cfg, null, 2), "utf-8");
    }
    getRuntime(botId) {
        if (!this.runtime.has(botId)) {
            this.runtime.set(botId, { running: false, startedAt: null, history: [] });
        }
        return this.runtime.get(botId);
    }
    listBots() {
        const dirs = fs_1.default
            .readdirSync(this.baseDir, { withFileTypes: true })
            .filter((d) => d.isDirectory() && d.name !== SOULS_DIR)
            .map((d) => d.name);
        return dirs
            .map((botId) => {
            const cfg = this.readConfig(botId);
            if (!cfg)
                return null;
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
    startBot(botId, incoming) {
        this.ensureBotDirs(botId);
        const prev = this.readConfig(botId);
        const next = {
            name: incoming?.name || prev?.name || botId,
            description: incoming?.description ?? prev?.description ?? "",
            persona: incoming?.persona ?? prev?.persona ?? "",
            channels: incoming?.channels ?? prev?.channels ?? {},
            model: incoming?.model ?? prev?.model ?? null,
            auto_start: true,
        };
        this.writeConfig(botId, next);
        const ws = this.workspaceDir(botId);
        const soulPath = path_1.default.join(ws, "SOUL.md");
        if (next.persona && (!fs_1.default.existsSync(soulPath) || !fs_1.default.readFileSync(soulPath, "utf-8").trim())) {
            fs_1.default.writeFileSync(soulPath, next.persona, "utf-8");
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
    stopBot(botId) {
        if (!this.readConfig(botId))
            return false;
        const rt = this.getRuntime(botId);
        if (!rt.running)
            return false;
        rt.running = false;
        return true;
    }
    destroyBot(botId) {
        const dir = this.botDir(botId);
        if (!fs_1.default.existsSync(dir))
            return false;
        fs_1.default.rmSync(dir, { recursive: true, force: true });
        this.runtime.delete(botId);
        return true;
    }
    getBot(botId) {
        const cfg = this.readConfig(botId);
        if (!cfg)
            return null;
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
            .filter((b) => !!b.running || !!b.started_at)
            .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")))
            .slice(0, limit)
            .map((b) => {
            const rt = this.getRuntime(String(b.bot_id));
            const last = rt.history[rt.history.length - 1];
            return { ...b, last_message_preview: last?.content || "" };
        });
    }
    readAllBotFiles(botId) {
        this.ensureBotDirs(botId);
        const ws = this.workspaceDir(botId);
        const out = {};
        for (const file of BOT_FILES) {
            out[file] = fs_1.default.existsSync(path_1.default.join(ws, file)) ? fs_1.default.readFileSync(path_1.default.join(ws, file), "utf-8") : "";
        }
        return out;
    }
    readBotFile(botId, filename) {
        if (!BOT_FILES.includes(filename))
            return null;
        this.ensureBotDirs(botId);
        return fs_1.default.readFileSync(path_1.default.join(this.workspaceDir(botId), filename), "utf-8");
    }
    writeBotFile(botId, filename, content) {
        if (!BOT_FILES.includes(filename))
            return false;
        this.ensureBotDirs(botId);
        fs_1.default.writeFileSync(path_1.default.join(this.workspaceDir(botId), filename), content ?? "", "utf-8");
        return true;
    }
    getBotHistory(botId, limit = 100) {
        const rt = this.getRuntime(botId);
        return rt.history.slice(-Math.max(1, limit));
    }
    appendHistory(botId, role, content) {
        const rt = this.getRuntime(botId);
        rt.history.push({ role, content, ts: new Date().toISOString() });
        if (rt.history.length > 2000)
            rt.history = rt.history.slice(-2000);
    }
    listSouls() {
        const dir = this.ensureSoulsDir();
        return fs_1.default
            .readdirSync(dir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
            const p = path_1.default.join(dir, f);
            return JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
        })
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    getSoul(id) {
        const p = path_1.default.join(this.ensureSoulsDir(), `${id}.json`);
        if (!fs_1.default.existsSync(p))
            return null;
        return JSON.parse(fs_1.default.readFileSync(p, "utf-8"));
    }
    createSoul(id, name, content) {
        const p = path_1.default.join(this.ensureSoulsDir(), `${id}.json`);
        if (fs_1.default.existsSync(p))
            return null;
        const soul = { id, name, content };
        fs_1.default.writeFileSync(p, JSON.stringify(soul, null, 2), "utf-8");
        return soul;
    }
    updateSoul(id, name, content) {
        const current = this.getSoul(id);
        if (!current)
            return null;
        const next = {
            id,
            name: name ?? current.name,
            content: content ?? current.content,
        };
        fs_1.default.writeFileSync(path_1.default.join(this.ensureSoulsDir(), `${id}.json`), JSON.stringify(next, null, 2), "utf-8");
        return next;
    }
    deleteSoul(id) {
        const p = path_1.default.join(this.ensureSoulsDir(), `${id}.json`);
        if (!fs_1.default.existsSync(p))
            return false;
        fs_1.default.unlinkSync(p);
        return true;
    }
    seedDefaultSouls() {
        if (this.listSouls().length > 0)
            return;
        this.createSoul("default", "Default", TEMPLATE_FILES["SOUL.md"]);
    }
}
exports.tutorbotManager = new TutorbotManager();
exports.tutorbotManager.seedDefaultSouls();
