const fs = require("fs");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuote && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => String(v || "").trim());
}

async function main() {
  const csvPath = process.env.CSV_PATH || "/Users/QUAN/Downloads/家长先疯_学习资料_表格.csv";
  const apiBase = process.env.API_BASE || "http://127.0.0.1:3001";
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123456";

  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const rows = lines.slice(1);

  const loginResp = await fetch(apiBase + "/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginResp.ok) {
    throw new Error("登录失败: " + loginResp.status);
  }
  const loginData = await loginResp.json();
  const token = loginData.token;
  if (!token) throw new Error("登录返回缺少 token");

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const line of rows) {
    if (!line.trim()) continue;
    const [name, url, grade, subject, stage, keycat] = parseCsvLine(line);
    if (!name || !url) {
      skip += 1;
      continue;
    }

    const payload = {
      title: name,
      fileUrl: url,
      category: [stage, subject, grade, keycat].filter(Boolean).join(" / ") || "未分类",
      description:
        "年级：" +
        (grade || "未标注") +
        "；学科：" +
        (subject || "未标注") +
        "；阶段：" +
        (stage || "未标注") +
        "；关键分类：" +
        (keycat || "未标注"),
      status: "published",
    };

    const resp = await fetch(apiBase + "/api/admin/learning-materials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      ok += 1;
      continue;
    }

    const text = await resp.text();
    if (resp.status === 400 || resp.status === 409 || /已存在|duplicate|E11000/i.test(text)) {
      skip += 1;
    } else {
      fail += 1;
    }
  }

  const verifyResp = await fetch(apiBase + "/api/learning-materials");
  const verifyData = verifyResp.ok ? await verifyResp.json() : [];
  const finalCount = Array.isArray(verifyData) ? verifyData.length : -1;

  console.log(JSON.stringify({ ok, skip, fail, finalCount }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
