const { buildUrl } = require("../../utils/request");

const PROGRAM_SHARE_CANVAS_ID = "xf-program-share-canvas";
const PROGRAM_SHARE_POSTER_WIDTH = 750;
const PROGRAM_SHARE_POSTER_HEIGHT = 1520;
const PROGRAM_SHARE_GUEST_FALLBACK = "/assets/wel-avatar/no-hat.png";
const PROGRAM_SHARE_QR_PREFIX = "xf-program-share-qr";

function currentMiniProgramEnvVersion() {
  if (typeof wx === "undefined" || typeof wx.getAccountInfoSync !== "function") return "";
  try {
    const info = wx.getAccountInfoSync();
    const envVersion = String(info && info.miniProgram && info.miniProgram.envVersion || "").trim();
    return ["develop", "trial", "release"].includes(envVersion) ? envVersion : "";
  } catch (_error) {
    return "";
  }
}

function buildProgramShareQrUrl(programId) {
  const params = [`programId=${encodeURIComponent(String(programId || "").trim())}`];
  const envVersion = currentMiniProgramEnvVersion();
  if (envVersion && envVersion !== "release") params.push(`envVersion=${encodeURIComponent(envVersion)}`);
  return buildUrl(`/api/wechat-mini/program-qrcode?${params.join("&")}`);
}

function programShareQrFilePath(programId) {
  const safeId = String(programId || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  const userDataPath = String(typeof wx !== "undefined" && wx.env && wx.env.USER_DATA_PATH || "");
  return userDataPath && safeId ? `${userDataPath}/${PROGRAM_SHARE_QR_PREFIX}-${safeId}.jpg` : "";
}

function downloadProgramShareQr(programId) {
  if (typeof wx === "undefined" || typeof wx.request !== "function" || typeof wx.getFileSystemManager !== "function") {
    return Promise.reject(new Error("当前环境暂不支持生成小程序码"));
  }
  const filePath = programShareQrFilePath(programId);
  if (!filePath) return Promise.reject(new Error("小程序码保存失败，请重试"));
  const fs = wx.getFileSystemManager();
  return new Promise((resolve, reject) => {
    wx.request({
      url: buildProgramShareQrUrl(programId),
      responseType: "arraybuffer",
      success(res) {
        if (Number(res && res.statusCode) !== 200 || !res || !res.data) {
          reject(new Error("小程序码生成失败，请重试"));
          return;
        }
        fs.writeFile({
          filePath,
          data: res.data,
          success() { resolve(filePath); },
          fail() { reject(new Error("小程序码保存失败，请重试")); }
        });
      },
      fail() { reject(new Error("小程序码生成失败，请重试")); }
    });
  });
}

function resolveProgramShareImage(image) {
  const src = String(image || "").trim();
  if (!src) return Promise.resolve(null);
  if (src.startsWith("/") && !src.startsWith("//")) return Promise.resolve({ path: src, width: 0, height: 0 });
  if (typeof wx === "undefined" || typeof wx.getImageInfo !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    timeout = setTimeout(() => finish(null), 3000);
    wx.getImageInfo({
      src,
      success(result) {
        const path = String(result && result.path || "");
        finish(path ? {
          path,
          width: Number(result && result.width) || 0,
          height: Number(result && result.height) || 0
        } : null);
      },
      fail() { finish(null); }
    });
  });
}

function resolveProgramShareCover(coverImage) {
  return resolveProgramShareImage(coverImage);
}

function resolveProgramShareGuestAvatars(guests) {
  const list = Array.isArray(guests) ? guests : [];
  return Promise.all(list.map((guest) => (
    resolveProgramShareImage(guest && guest.avatar)
      .then((image) => image || { path: PROGRAM_SHARE_GUEST_FALLBACK, width: 0, height: 0 })
  )));
}

function setFontSize(ctx, size) {
  if (ctx && typeof ctx.setFontSize === "function") ctx.setFontSize(size);
}

function setFont(ctx, size, weight = "normal") {
  setFontSize(ctx, size);
  try {
    ctx.font = `${weight} ${size}px sans-serif`;
  } catch (_error) {
    // Legacy CanvasContext still uses setFontSize.
  }
}

function setTextAlign(ctx, align) {
  if (ctx && typeof ctx.setTextAlign === "function") ctx.setTextAlign(align);
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fill();
}

function textWidth(ctx, text, fontSize) {
  if (ctx && typeof ctx.measureText === "function") {
    const measured = ctx.measureText(String(text || ""));
    if (measured && Number.isFinite(measured.width)) return measured.width;
  }
  return String(text || "").length * fontSize;
}

function wrapPosterText(ctx, value, maxWidth, fontSize, maxLines) {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const lines = [];
  let line = "";
  source.split("").forEach((char) => {
    const next = `${line}${char}`;
    if (line && textWidth(ctx, next, fontSize) > maxWidth) {
      if (/^[，。！？、：；）】》…]/.test(char)) {
        lines.push(`${line}${char}`);
        line = "";
      } else {
        lines.push(line);
        line = char;
      }
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length) {
    const index = visible.length - 1;
    visible[index] = `${visible[index].slice(0, Math.max(0, visible[index].length - 1))}…`;
  }
  return visible;
}

function drawAspectFill(ctx, image, x, y, width, height) {
  const source = typeof image === "string" ? { path: image } : (image || {});
  const path = String(source.path || "");
  if (!path) return;
  const imageWidth = Number(source.width) || 0;
  const imageHeight = Number(source.height) || 0;
  if (!imageWidth || !imageHeight) {
    ctx.drawImage(path, x, y, width, height);
    return;
  }
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (imageWidth - sourceWidth) / 2;
  const sourceY = (imageHeight - sourceHeight) / 2;
  ctx.drawImage(path, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawCircularImage(ctx, image, x, y, size) {
  if (!image || !image.path) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawAspectFill(ctx, image, x, y, size, size);
  ctx.restore();
  ctx.setStrokeStyle("rgba(255,255,255,0.94)");
  ctx.setLineWidth(3);
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 1.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function drawProgramSharePoster(ctx, program, qrImagePath, coverImagePath, guestAvatarImages) {
  const item = program || {};
  ctx.setFillStyle("#f5f2f8");
  ctx.fillRect(0, 0, PROGRAM_SHARE_POSTER_WIDTH, PROGRAM_SHARE_POSTER_HEIGHT);

  ctx.setFillStyle("#ffffff");
  ctx.fillRect(0, 0, PROGRAM_SHARE_POSTER_WIDTH, 100);
  ctx.setFillStyle("#211a18");
  setFont(ctx, 28, "normal");
  setTextAlign(ctx, "center");
  ctx.fillText(String(item.showLabel || "家长先疯"), PROGRAM_SHARE_POSTER_WIDTH / 2, 63);
  setTextAlign(ctx, "left");

  const heroY = 100;
  const heroHeight = 300;
  ctx.setFillStyle("#42108c");
  ctx.fillRect(0, heroY, PROGRAM_SHARE_POSTER_WIDTH, heroHeight);
  drawAspectFill(ctx, coverImagePath, 0, heroY, PROGRAM_SHARE_POSTER_WIDTH, heroHeight);
  const heroShade = typeof ctx.createLinearGradient === "function"
    ? ctx.createLinearGradient(0, heroY, 0, heroY + heroHeight)
    : "rgba(28,3,63,0.82)";
  if (heroShade && typeof heroShade.addColorStop === "function") {
    heroShade.addColorStop(0, "rgba(75,20,156,0.74)");
    heroShade.addColorStop(1, "rgba(19,2,45,0.94)");
  }
  ctx.setFillStyle(heroShade);
  ctx.fillRect(0, heroY, PROGRAM_SHARE_POSTER_WIDTH, heroHeight);

  ctx.setFillStyle("#ffffff");
  setFont(ctx, 46, "bold");
  const titleLines = wrapPosterText(ctx, item.title || "节目详情", 650, 46, 3);
  drawLines(ctx, titleLines, 50, 178, 60);

  const cardY = 360;
  ctx.setFillStyle("#ffffff");
  roundedRect(ctx, 28, cardY, 694, 420, 30);

  ctx.setFillStyle("#5e17eb");
  ctx.fillRect(54, cardY + 44, 7, 82);
  ctx.setFillStyle("#211a18");
  setFont(ctx, 31, "bold");
  const headlineLines = wrapPosterText(ctx, item.summaryHeadline || item.title, 606, 32, 2);
  drawLines(ctx, headlineLines, 80, cardY + 72, 43);

  ctx.setFillStyle("#4b4557");
  setFont(ctx, 25, "normal");
  const summaryLines = wrapPosterText(ctx, item.summaryBody || item.description, 620, 25, 4);
  drawLines(ctx, summaryLines, 54, cardY + 184, 39);

  let tagX = 54;
  (Array.isArray(item.tags) ? item.tags.slice(0, 4) : []).forEach((tag) => {
    const label = String(tag || "").trim();
    if (!label) return;
    const width = Math.min(160, Math.max(72, textWidth(ctx, label, 20) + 32));
    ctx.setFillStyle("#f1eff3");
    roundedRect(ctx, tagX, cardY + 360, width, 38, 19);
    ctx.setFillStyle("#6f6976");
    setFont(ctx, 20, "bold");
    setTextAlign(ctx, "center");
    ctx.fillText(label, tagX + width / 2, cardY + 386);
    setTextAlign(ctx, "left");
    tagX += width + 12;
  });

  const guestPanelY = 800;
  ctx.setFillStyle("#ffffff");
  roundedRect(ctx, 28, guestPanelY, 694, 500, 30);
  ctx.setFillStyle("#5e17eb");
  setFont(ctx, 30, "bold");
  ctx.fillText("本期嘉宾", 54, guestPanelY + 56);
  ctx.setFillStyle("#938d99");
  setFont(ctx, 18, "bold");
  ctx.fillText("G U E S T S", 190, guestPanelY + 54);

  const guests = Array.isArray(item.guests) ? item.guests : [];
  const avatars = Array.isArray(guestAvatarImages) ? guestAvatarImages : [];
  const columns = guests.length > 3 ? 2 : 1;
  const rows = Math.max(1, Math.ceil(guests.length / columns));
  const gap = 12;
  const cardWidth = columns === 1 ? 642 : 315;
  const availableHeight = 400;
  const cardHeight = Math.min(126, (availableHeight - gap * (rows - 1)) / rows);
  guests.forEach((guest, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 54 + column * (cardWidth + gap);
    const y = guestPanelY + 78 + row * (cardHeight + gap);
    ctx.setFillStyle("#faf8fd");
    roundedRect(ctx, x, y, cardWidth, cardHeight, 18);

    const avatarSize = Math.min(columns === 1 ? 72 : 56, Math.max(42, cardHeight - 28));
    drawCircularImage(ctx, avatars[index], x + 16, y + 14, avatarSize);
    const textX = x + avatarSize + 34;
    ctx.setFillStyle("#211a18");
    setFont(ctx, columns === 1 ? 25 : 22, "bold");
    ctx.fillText(String(guest && guest.name || "节目特邀嘉宾"), textX, y + 38);
    ctx.setFillStyle("#746d7f");
    setFont(ctx, columns === 1 ? 19 : 17, "normal");
    const titleLines = wrapPosterText(ctx, guest && guest.title, cardWidth - avatarSize - 50, columns === 1 ? 19 : 17, 1);
    drawLines(ctx, titleLines, textX, y + 66, 24);

    ctx.setFillStyle("#4b4557");
    setFont(ctx, columns === 1 ? 20 : 17, "normal");
    const bioWidth = columns === 1 ? cardWidth - avatarSize - 50 : cardWidth - 32;
    const bioX = columns === 1 ? textX : x + 16;
    const bioY = columns === 1 ? y + 98 : y + cardHeight - 20;
    const bioLines = wrapPosterText(ctx, guest && guest.bio, bioWidth, columns === 1 ? 20 : 17, 1);
    drawLines(ctx, bioLines, bioX, bioY, 24);
  });

  ctx.setFillStyle("#ffffff");
  roundedRect(ctx, 28, 1320, 694, 172, 28);
  ctx.drawImage(qrImagePath, 52, 1334, 144, 144);
  ctx.setFillStyle("#211a18");
  setFont(ctx, 29, "bold");
  ctx.fillText("微信扫码，直达本期节目", 228, 1373);
  ctx.setFillStyle("#817a8d");
  setFont(ctx, 22, "normal");
  ctx.fillText("打开家长先疯，继续收听与阅读", 228, 1414);
  ctx.fillText("长按保存，分享给更多家长", 228, 1454);
}

module.exports = {
  PROGRAM_SHARE_CANVAS_ID,
  PROGRAM_SHARE_POSTER_WIDTH,
  PROGRAM_SHARE_POSTER_HEIGHT,
  buildProgramShareQrUrl,
  programShareQrFilePath,
  downloadProgramShareQr,
  resolveProgramShareCover,
  resolveProgramShareGuestAvatars,
  wrapPosterText,
  drawProgramSharePoster
};
