import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../../lib/api";

type Msg = { role: "user" | "assistant"; content: string; ts?: string };

export default function AdminAgentsChatPage() {
  const { botId = "" } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${localStorage.getItem("token") || ""}` }), []);

  async function reloadHistory() {
    const res = await fetch(apiUrl(`/api/v1/tutorbot/${botId}/history?limit=200`), { headers: authHeaders });
    if (!res.ok) return;
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void reloadHistory();
    const timer = setInterval(() => void reloadHistory(), 2000);
    return () => clearInterval(timer);
  }, [botId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setSending(true);
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${botId}/messages`), {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        setText("");
        await reloadHistory();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[960px] px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">TutorBot Chat · {botId}</h1>
        <button onClick={() => navigate("/admin/agents")} className="rounded-lg border px-3 py-1.5 text-[12px]">Back</button>
      </div>
      <div className="mb-4 h-[520px] overflow-auto rounded-xl border p-4">
        <div className="space-y-3">
          {messages.map((m, idx) => (
            <div key={`${idx}-${m.ts || ""}`} className={m.role === "user" ? "text-right" : "text-left"}>
              <div className={`inline-block max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] ${m.role === "user" ? "bg-violet-600 text-white" : "bg-stone-100 text-stone-900"}`}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
      <form onSubmit={send} className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 rounded-lg border px-3 py-2 text-[13px]" placeholder="Type a message..." />
        <button disabled={sending} className="rounded-lg bg-violet-600 px-4 py-2 text-[13px] text-white disabled:opacity-40">{sending ? "..." : "Send"}</button>
      </form>
    </div>
  );
}