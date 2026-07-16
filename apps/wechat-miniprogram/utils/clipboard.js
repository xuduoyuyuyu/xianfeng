function copyTextSilently(value) {
  const text = String(value || "").trim();
  if (!text || typeof wx === "undefined" || typeof wx.setClipboardData !== "function") return false;
  wx.setClipboardData({ data: text });
  return true;
}

module.exports = { copyTextSilently };
