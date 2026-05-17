import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../lib/api";

interface BotInfo {
  bot_id: string;
  name: string;
  description: string;
  persona: string;
  channels: string[];
  model: string | null;
  running: boolean;
  started_at: string | null;
}

interface SoulTemplate {
  id: string;
  name: string;
  content: string;
}

type Tab = "bots" | "profiles" | "souls";

const BOT_FILES = ["SOUL.md", "USER.md", "TOOLS.md", "AGENTS.md", "HEARTBEAT.md"] as const;
type BotFile = (typeof BOT_FILES)[number];

const t = (s: string) => s;

function Icon({ label }: { label: string }) {
  return <span className="inline-block text-[12px]">{label}</span>;
}

export default function AdminAgentsPage() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [souls, setSouls] = useState<SoulTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("bots");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadBots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/v1/tutorbot"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      setBots(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSouls = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/v1/tutorbot/souls"), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (res.ok) setSouls(await res.json());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadBots();
    void loadSouls();
  }, [loadBots, loadSouls]);

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-[960px] px-6 py-8">
        <div className="mb-6">
          <h1 className="text-[16px] font-semibold tracking-tight text-[var(--foreground)]">{t("TutorBot Agents")}</h1>
          {toast ? (
            <p className="mt-1 text-[13px] text-[var(--primary)] animate-fade-in">{toast}</p>
          ) : (
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">{t("Manage your in-process TutorBot instances")}</p>
          )}
        </div>

        <div className="mb-6 flex items-center gap-1 border-b border-[var(--border)]/50 pb-3">
          {([
            { key: "bots" as Tab, label: t("Bots"), icon: "🤖" },
            { key: "profiles" as Tab, label: t("Profiles"), icon: "📄" },
            { key: "souls" as Tab, label: t("Souls"), icon: "❤️" },
          ]).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-[var(--muted)] font-medium text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <Icon label={tab.icon} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "bots" ? (
          <BotsTab bots={bots} souls={souls} loading={loading} onReload={loadBots} onToast={setToast} navigate={navigate} />
        ) : activeTab === "profiles" ? (
          <ProfilesTab bots={bots} loading={loading} onToast={setToast} />
        ) : (
          <SoulsTab souls={souls} onReload={loadSouls} onToast={setToast} />
        )}
      </div>
    </div>
  );
}

function BotsTab({
  bots,
  souls,
  loading,
  onReload,
  onToast,
  navigate,
}: {
  bots: BotInfo[];
  souls: SoulTemplate[];
  loading: boolean;
  onReload: () => Promise<void>;
  onToast: (msg: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSoulId, setFormSoulId] = useState("_custom");
  const [formSoul, setFormSoul] = useState("");
  const [formModel, setFormModel] = useState("");

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormSoulId("_custom");
    setFormSoul("");
    setFormModel("");
  };

  const botId = useMemo(() => {
    const slug = formName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return slug || "";
  }, [formName]);

  const selectSoul = (id: string) => {
    setFormSoulId(id);
    if (id !== "_custom") {
      const soul = souls.find((s) => s.id === id);
      if (soul) setFormSoul(soul.content);
    }
  };

  const createBot = useCallback(async () => {
    if (!botId) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl("/api/v1/tutorbot"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({
          bot_id: botId,
          name: formName.trim(),
          description: formDesc.trim(),
          persona: formSoul.trim(),
          model: formModel.trim() || undefined,
        }),
      });
      if (res.ok) {
        onToast(`${formName.trim()} created`);
        setShowCreate(false);
        resetForm();
        await onReload();
      }
    } finally {
      setCreating(false);
    }
  }, [botId, formName, formDesc, formSoul, formModel, onReload, onToast]);

  const startBot = useCallback(
    async (bid: string) => {
      const res = await fetch(apiUrl("/api/v1/tutorbot"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ bot_id: bid }),
      });
      if (res.ok) {
        onToast(`${bid} started`);
        await onReload();
      }
    },
    [onReload, onToast]
  );

  const stopBot = useCallback(
    async (bid: string) => {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${bid}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (res.ok) {
        onToast(`${bid} stopped`);
        await onReload();
      }
    },
    [onReload, onToast]
  );

  const destroyBot = useCallback(
    async (bid: string, name: string) => {
      if (!window.confirm(`Permanently delete "${name}" (${bid})? This cannot be undone.`)) return;
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${bid}/destroy`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (res.ok) {
        onToast(`${name} deleted`);
        await onReload();
      }
    },
    [onReload, onToast]
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]"
        >
          <Icon label="＋" />
          {t("New Bot")}
        </button>
      </div>

      {showCreate && (
        <div className="mb-6 rounded-xl border border-[var(--border)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-medium text-[var(--foreground)]">{t("Create TutorBot")}</h2>
            <button onClick={() => { setShowCreate(false); resetForm(); }} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">×</button>
          </div>
          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">{t("Name")}</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("e.g. Math Tutor")} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)] placeholder:text-[var(--muted-foreground)]/40" />
              {botId && <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">ID: {botId}</p>}
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">{t("Description")} <span className="font-normal opacity-60">{t("(optional)")}</span></label>
              <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder={t("A brief description of what this bot does")} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)] placeholder:text-[var(--muted-foreground)]/40" />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">{t("Soul")}</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button onClick={() => selectSoul("_custom")} className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${formSoulId === "_custom" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{t("Custom")}</button>
                {souls.map((s) => (
                  <button key={s.id} onClick={() => selectSoul(s.id)} className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${formSoulId === s.id ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{s.name}</button>
                ))}
              </div>
              <textarea value={formSoul} onChange={(e) => { setFormSoul(e.target.value); setFormSoulId("_custom"); }} placeholder={t("Define the bot's personality, values, and communication style in markdown...")} rows={8} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[13px] leading-6 text-[var(--foreground)] outline-none focus:border-[var(--ring)] placeholder:text-[var(--muted-foreground)]/40" />
              <p className="mt-1 text-[11px] text-[var(--muted-foreground)]/60">{t("Pick a soul from the library above, or write your own. Manage the library in the Souls tab.")}</p>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">{t("Model")} <span className="font-normal opacity-60">{t("(optional)")}</span></label>
              <input value={formModel} onChange={(e) => setFormModel(e.target.value)} placeholder={t("Uses default model if empty")} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)] placeholder:text-[var(--muted-foreground)]/40" />
            </div>
            <div className="flex justify-end">
              <button onClick={createBot} disabled={creating || !botId} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40">{creating ? "..." : "▶"} {t("Create & Start")}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[320px] items-center justify-center">...</div>
      ) : bots.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-center">
          <div className="mb-3 rounded-xl bg-[var(--muted)] p-2.5 text-[var(--muted-foreground)]"><Icon label="🤖" /></div>
          <p className="text-[14px] font-medium text-[var(--foreground)]">{t("No TutorBots yet")}</p>
          <p className="mt-1.5 max-w-xs text-[13px] text-[var(--muted-foreground)]">{t("Create your first TutorBot to get started.")}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {bots.map((bot) => (
            <div key={bot.bot_id} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-5 py-4 transition-colors hover:border-[var(--border)]">
              <div className="min-w-0 flex items-center gap-4">
                <div className={`h-2 w-2 shrink-0 rounded-full ${bot.running ? "bg-emerald-500" : "bg-[var(--muted-foreground)]/30"}`} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[var(--foreground)]">{bot.name}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[var(--muted-foreground)]">
                    {bot.description ? <span className="max-w-[300px] truncate">{bot.description}</span> : <span>{bot.bot_id}</span>}
                    {bot.model && <span>· {bot.model}</span>}
                    {bot.started_at && <span>· started {new Date(bot.started_at).toLocaleString()}</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {bot.running ? (
                  <>
                    <button onClick={() => navigate(`/admin/agents/${bot.bot_id}/chat`)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-[var(--primary)] transition-colors hover:border-[var(--primary)]/50">💬 {t("Chat")}</button>
                    <button onClick={() => stopBot(bot.bot_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-red-400 transition-colors hover:border-red-400/50">■ {t("Stop")}</button>
                  </>
                ) : (
                  <button onClick={() => startBot(bot.bot_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]">▶ {t("Start")}</button>
                )}
                <button onClick={() => destroyBot(bot.bot_id, bot.name)} className="inline-flex items-center justify-center rounded-lg border border-[var(--border)]/50 p-1.5 text-[var(--muted-foreground)]/50 transition-colors hover:border-red-400/50 hover:text-red-400">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProfilesTab({ bots, loading, onToast }: { bots: BotInfo[]; loading: boolean; onToast: (msg: string) => void }) {
  const [selectedBot, setSelectedBot] = useState<string>("");
  const [activeFile, setActiveFile] = useState<BotFile>("SOUL.md");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bots.length > 0 && !selectedBot) setSelectedBot(bots[0].bot_id);
  }, [bots, selectedBot]);

  const loadFiles = useCallback(async (bid: string) => {
    if (!bid) return;
    setLoadingFiles(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${bid}/files`), { headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
      const data: Record<string, string> = await res.json();
      setFiles(data);
      setEditor(data[activeFile] ?? "");
    } finally {
      setLoadingFiles(false);
    }
  }, [activeFile]);

  useEffect(() => {
    if (selectedBot) void loadFiles(selectedBot);
  }, [selectedBot, loadFiles]);

  useEffect(() => setEditor(files[activeFile] ?? ""), [activeFile, files]);

  const saveFile = useCallback(async () => {
    if (!selectedBot) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${selectedBot}/files/${activeFile}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ content: editor }),
      });
      if (res.ok) {
        setFiles((prev) => ({ ...prev, [activeFile]: editor }));
        onToast(`${activeFile} saved`);
      }
    } finally {
      setSaving(false);
    }
  }, [selectedBot, activeFile, editor, onToast]);

  if (loading) return <div className="flex min-h-[320px] items-center justify-center">...</div>;

  if (bots.length === 0) {
    return <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-center"><p className="text-[14px] font-medium text-[var(--foreground)]">No bots to configure</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="shrink-0 text-[12px] font-medium text-[var(--muted-foreground)]">Bot</label>
        <select value={selectedBot} onChange={(e) => setSelectedBot(e.target.value)} className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)]">
          {bots.map((b) => <option key={b.bot_id} value={b.bot_id}>{b.name} ({b.bot_id})</option>)}
        </select>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--border)]/50 pb-2">
        {BOT_FILES.map((fn) => <button key={fn} onClick={() => setActiveFile(fn)} className={`rounded-lg px-2.5 py-1 text-[12px] transition-colors ${activeFile === fn ? "bg-[var(--muted)] font-medium text-[var(--foreground)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>{fn.replace(".md", "")}</button>)}
      </div>

      <div className="flex items-center justify-end">
        <button onClick={saveFile} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)] disabled:opacity-40">{saving ? "..." : "💾"} Save</button>
      </div>

      {loadingFiles ? (
        <div className="flex min-h-[400px] items-center justify-center">...</div>
      ) : (
        <div>
          <textarea value={editor} onChange={(e) => setEditor(e.target.value)} spellCheck={false} className="min-h-[420px] w-full resize-none rounded-xl border border-[var(--border)] bg-transparent px-5 py-4 font-mono text-[13px] leading-7 text-[var(--foreground)] outline-none transition-colors focus:border-[var(--ring)] placeholder:text-[var(--muted-foreground)]/40" />
        </div>
      )}
    </div>
  );
}

function SoulsTab({ souls, onReload, onToast }: { souls: SoulTemplate[]; onReload: () => Promise<void>; onToast: (msg: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");

  const startEdit = (soul: SoulTemplate) => { setEditing(soul.id); setEditName(soul.name); setEditContent(soul.content); setCreating(false); };
  const cancelEdit = () => { setEditing(null); setEditName(""); setEditContent(""); };

  const saveSoul = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/souls/${editing}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ name: editName.trim(), content: editContent }),
      });
      if (res.ok) {
        onToast(`"${editName.trim()}" updated`);
        cancelEdit();
        await onReload();
      }
    } finally { setSaving(false); }
  }, [editing, editName, editContent, onReload, onToast]);

  const createSoul = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/api/v1/tutorbot/souls"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: JSON.stringify({ id, name, content: newContent }),
      });
      if (res.ok) {
        onToast(`"${name}" created`);
        setCreating(false);
        setNewName("");
        setNewContent("");
        await onReload();
      } else if (res.status === 409) {
        onToast(`Soul ID "${id}" already exists`);
      }
    } finally { setSaving(false); }
  }, [newName, newContent, onReload, onToast]);

  const deleteSoul = useCallback(async (soul: SoulTemplate) => {
    if (!window.confirm(`Delete soul "${soul.name}"?`)) return;
    const res = await fetch(apiUrl(`/api/v1/tutorbot/souls/${soul.id}`), { method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` } });
    if (res.ok) {
      if (editing === soul.id) cancelEdit();
      onToast(`"${soul.name}" deleted`);
      await onReload();
    }
  }, [editing, onReload, onToast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--muted-foreground)]">Reusable soul templates for creating TutorBots.</p>
        <button onClick={() => { setCreating(true); setEditing(null); setNewName(""); setNewContent(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]">＋ New Soul</button>
      </div>

      {creating && (
        <div className="rounded-xl border border-[var(--border)] p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-[15px] font-medium text-[var(--foreground)]">New Soul</h2><button onClick={() => setCreating(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">×</button></div>
          <div className="grid gap-3">
            <div><label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">Name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)]" /></div>
            <div><label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">Content</label><textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={10} spellCheck={false} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[13px] leading-6 text-[var(--foreground)] outline-none focus:border-[var(--ring)]" /></div>
            <div className="flex justify-end gap-2"><button onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">Cancel</button><button onClick={createSoul} disabled={saving || !newName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40">{saving ? "..." : "+"} Create</button></div>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {souls.map((soul) => editing === soul.id ? (
          <div key={soul.id} className="rounded-xl border border-[var(--ring)] p-5">
            <div className="grid gap-3">
              <div><label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">Name</label><input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:border-[var(--ring)]" /></div>
              <div><label className="mb-1 block text-[12px] font-medium text-[var(--muted-foreground)]">Content</label><textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={12} spellCheck={false} className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[13px] leading-6 text-[var(--foreground)] outline-none focus:border-[var(--ring)]" /></div>
              <div className="flex justify-end gap-2"><button onClick={cancelEdit} className="rounded-lg px-3 py-1.5 text-[12px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">Cancel</button><button onClick={saveSoul} disabled={saving || !editName.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-40">{saving ? "..." : "💾"} Save</button></div>
            </div>
          </div>
        ) : (
          <div key={soul.id} className="group flex items-start justify-between rounded-xl border border-[var(--border)] px-5 py-4 transition-colors hover:border-[var(--border)]">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span>❤️</span><p className="text-[14px] font-medium text-[var(--foreground)]">{soul.name}</p><span className="text-[11px] text-[var(--muted-foreground)]/60">{soul.id}</span></div><p className="mt-1.5 line-clamp-2 pl-5.5 text-[12px] leading-5 text-[var(--muted-foreground)]">{soul.content.replace(/^#.*\n+/g, "").slice(0, 200)}</p></div>
            <div className="ml-4 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"><button onClick={() => startEdit(soul)} className="inline-flex items-center justify-center rounded-lg border border-[var(--border)]/50 p-1.5 text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]">✎</button><button onClick={() => deleteSoul(soul)} className="inline-flex items-center justify-center rounded-lg border border-[var(--border)]/50 p-1.5 text-[var(--muted-foreground)] transition-colors hover:border-red-400/50 hover:text-red-400">🗑</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
