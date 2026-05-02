import React, { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../../lib/api";

type Msg = { role: "user" | "assistant"; content: string; ts?: string };

const BOT_ID = "xiaowanzi_debug_bot";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const XiaowanziWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: "你好，我是小玩子 ✨", ts: new Date().toISOString() }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("● 随时可用");
  const avatar = useMemo(() => "/assets/wel-avatar/no-hat.png", []);

  async function ensureBotReady() {
    const token = localStorage.getItem("token") || "";
    if (!token) {
      setStatusText("● 请先登录管理后台");
      return false;
    }

    const createRes = await fetch(apiUrl("/api/v1/tutorbot"), {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        bot_id: BOT_ID,
        name: "小玩子调试",
        description: "前台小玩子调试实例",
        model: "chat_manager_agent",
      }),
    });

    if (!createRes.ok) {
      setStatusText("● 调试实例启动失败");
      return false;
    }

    setStatusText("● 已连接调试实例");
    return true;
  }

  async function reloadHistory() {
    const token = localStorage.getItem("token") || "";
    if (!token) return;
    const res = await fetch(apiUrl(`/api/v1/tutorbot/${BOT_ID}/history?limit=100`), { headers: getAuthHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      setMessages(data as Msg[]);
    }
  }

  useEffect(() => {
    if (!open) return;
    (async () => {
      const ok = await ensureBotReady();
      if (ok) await reloadHistory();
    })();
  }, [open]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    const token = localStorage.getItem("token") || "";
    if (!token) {
      setStatusText("● 请先登录管理后台");
      return;
    }

    setSending(true);
    setInput("");
    try {
      const res = await fetch(apiUrl(`/api/v1/tutorbot/${BOT_ID}/messages`), {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = String(err?.content || err?.detail || "请求失败");
        setMessages((prev) => [...prev, { role: "assistant", content: msg, ts: new Date().toISOString() }]);
        return;
      }
      await reloadHistory();
    } finally {
      setSending(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  return (
    <>
      <style>{`
        #ai-fab{position:fixed;bottom:28px;right:28px;z-index:1800;width:48px;height:48px;border-radius:50%;background:transparent;border:none;box-shadow:0 4px 20px rgba(94,23,235,.3);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden}
        #ai-fab #ai-avatar-img{width:48px;height:48px;object-fit:contain;padding:6px;background:rgba(255,255,255,.92);border-radius:50%;display:block}
        #ai-panel{position:fixed;bottom:86px;right:28px;z-index:1800;width:360px;max-height:560px;background:#fff;border:1px solid rgba(17,10,8,.1);border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,.15);display:flex;flex-direction:column;overflow:hidden}
        .aip-head{position:relative;display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(17,10,8,.08);background:rgba(94,23,235,.04)}
        .aip-gem{width:34px;height:34px;border-radius:50%;overflow:hidden}
        .aip-title{font-size:14px;font-weight:700;color:#211a18}
        .aip-status{font-size:12px;color:#5e17eb}
        .aip-close{margin-left:auto;border:none;background:transparent;font-family:'Material Symbols Rounded';font-size:20px;color:#7d736f}
        .aip-msgs{padding:12px 14px;color:#575f6b;font-size:13px;line-height:1.6;max-height:300px;overflow:auto}
        .aip-msg{margin-bottom:8px;display:flex}
        .aip-msg.user{justify-content:flex-end}
        .aip-msg.assistant{justify-content:flex-start}
        .aip-bubble{max-width:82%;border-radius:12px;padding:8px 10px;white-space:pre-wrap}
        .aip-msg.user .aip-bubble{background:#5e17eb;color:#fff}
        .aip-msg.assistant .aip-bubble{background:#f3f4f6;color:#1f2937}
        .aip-shortcuts{display:flex;gap:8px;flex-wrap:wrap;padding:0 14px 12px}
        .aip-sc{border:1px solid rgba(94,23,235,.2);background:rgba(94,23,235,.05);border-radius:999px;padding:5px 10px;font-size:12px;color:#5e17eb}
        .aip-input-row{display:flex;align-items:end;gap:8px;padding:12px 14px;border-top:1px solid rgba(17,10,8,.08)}
        .aip-input{flex:1;border:1px solid rgba(17,10,8,.14);border-radius:12px;padding:8px 10px;resize:none;outline:none}
        .aip-send{width:36px;height:36px;border:none;border-radius:50%;background:#5e17eb;color:#fff;font-family:'Material Symbols Rounded'}
        .aip-send:disabled{opacity:.5;cursor:not-allowed}
      `}</style>
      {open ? (
        <div id="ai-panel">
          <div className="aip-head">
            <div className="aip-gem">
              <img id="ai-panel-avatar-img" src={avatar} alt="" draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 0 }} />
            </div>
            <div>
              <div className="aip-title">小玩子</div>
              <div className="aip-status" id="aip-status">{statusText}</div>
            </div>
            <button className="aip-close" onClick={() => setOpen(false)} type="button">close</button>
          </div>
          <div className="aip-msgs" id="aip-msgs">
            {messages.map((m, idx) => (
              <div key={`${idx}-${m.ts || ""}`} className={`aip-msg ${m.role}`}>
                <div className="aip-bubble">{m.content}</div>
              </div>
            ))}
          </div>
          <div className="aip-shortcuts" id="aip-shortcuts-list">
            <button className="aip-sc" type="button" onClick={() => void sendMessage("请帮我解释这个知识点")}>💡 解释知识点</button>
            <button className="aip-sc" type="button" onClick={() => void sendMessage("请分析我当前薄弱点")}>📊 薄弱分析</button>
            <button className="aip-sc" type="button" onClick={() => void sendMessage("请给我出3道练习题")}>✏️ 出题</button>
            <button className="aip-sc" type="button" onClick={() => void sendMessage("请给我今天的学习建议")}>📅 今日建议</button>
          </div>
          <div className="aip-input-row">
            <textarea className="aip-input" id="aip-input" rows={1} placeholder="问我任何学习问题…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onInputKeyDown} />
            <button className="aip-send" id="aip-send" type="button" onClick={() => void sendMessage()} disabled={sending}>{sending ? "..." : "send"}</button>
          </div>
        </div>
      ) : null}
      <button id="ai-fab" title="小玩子" onClick={() => setOpen((v) => !v)} type="button">
        <img id="ai-avatar-img" src={avatar} alt="" draggable={false} style={{ display: "block" }} />
      </button>
    </>
  );
};

export default XiaowanziWidget;
