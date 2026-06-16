import { useState, useEffect } from "react";

interface Props {
  user: any;
  token: string | null;
}

export default function ProfileGuideBanner({ user, token }: Props) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    // 检查用户是否缺少关键资料
    const needsProfile =
      !user.grade ||
      user.grade === "" ||
      user.grade === "初中八年级";
    if (needsProfile && !dismissed) {
      setShow(true);
    }
  }, [user, token, dismissed]);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 64,
        left: 0,
        right: 0,
        zIndex: 40,
        display: "flex",
        justifyContent: "center",
        padding: "0 16px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "14px 22px",
          borderRadius: 16,
          background: "linear-gradient(135deg, #5F19EC, #7c3aed)",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          boxShadow: "0 8px 32px rgba(95,25,236,0.3)",
          maxWidth: 600,
          width: "100%",
        }}
      >
        <span style={{ fontSize: 28 }}>🎯</span>
        <span style={{ flex: 1 }}>
          开启个性化模式，告诉我孩子的年级和关注点，内容更贴合你
        </span>
        <button
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "none",
            background: "#fff",
            color: "#5F19EC",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onClick={() => {
            // 打开绑定孩子/填写资料的弹窗
            document.dispatchEvent(
              new CustomEvent("xf-open-child-profile")
            );
            setShow(false);
            setDismissed(true);
          }}
        >
          填写资料
        </button>
        <button
          style={{
            padding: "4px",
            borderRadius: 999,
            border: "none",
            background: "rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          onClick={() => {
            setShow(false);
            setDismissed(true);
          }}
          title="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}
