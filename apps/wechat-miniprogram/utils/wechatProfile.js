const { request, buildUrl } = require("./request");
const { getToken, getUser, setSession } = require("./session");

const PLACEHOLDER_NAMES = new Set(["", "微信用户", "用户"]);

function isPlaceholderName(value) {
  const name = String(value || "").trim();
  return PLACEHOLDER_NAMES.has(name) || /^u?1\d{10}$/.test(name);
}

function normalizeWechatProfileUser(value) {
  const user = value && typeof value === "object" ? value : {};
  const name = String(user.name || user.nickName || user.username || "").trim();
  const avatar = Object.prototype.hasOwnProperty.call(user, "avatar_image")
    ? String(user.avatar_image || "").trim()
    : String(user.avatar || user.avatarUrl || "").trim();
  return { ...user, name, avatar, avatar_image: avatar };
}

function hasPersistentAvatar(value) {
  const avatar = String(value || "").trim();
  return (/^https?:\/\//i.test(avatar) && !/^https?:\/\/tmp\//i.test(avatar)) || avatar.startsWith("/uploads/");
}

function expiredAvatarError() {
  return new Error("头像已失效，请重新选择微信头像");
}

function ensureLocalAvatarExists(filePath) {
  return new Promise((resolve, reject) => {
    const manager = wx.getFileSystemManager && wx.getFileSystemManager();
    if (!manager || typeof manager.access !== "function") {
      resolve();
      return;
    }
    manager.access({
      path: filePath,
      success: resolve,
      fail: () => reject(expiredAvatarError())
    });
  });
}

function needsWechatProfileCompletion(value) {
  const user = normalizeWechatProfileUser(value);
  return isPlaceholderName(user.name) || !hasPersistentAvatar(user.avatar);
}

function uploadWechatAvatar(filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: buildUrl("/api/users/me/avatar"),
      filePath,
      name: "image",
      header: { Authorization: `Bearer ${getToken()}` },
      success(response) {
        let data = response && response.data;
        try {
          if (typeof data === "string") data = JSON.parse(data);
        } catch (_error) {}
        if (response && response.statusCode >= 200 && response.statusCode < 300 && data && data.url) {
          resolve(String(data.url));
          return;
        }
        reject(new Error((data && (data.error || data.message)) || "头像上传失败"));
      },
      fail(error) {
        const message = String(error && error.errMsg || "");
        reject(/no such file or directory/i.test(message) ? expiredAvatarError() : new Error(message || "头像上传失败"));
      }
    });
  });
}

async function saveWechatProfile({ name, avatarPath, allowEmptyAvatar = false, gender }) {
  const safeName = String(name || "").trim().slice(0, 40);
  if (isPlaceholderName(safeName)) throw new Error("请选择微信昵称");

  const current = normalizeWechatProfileUser(getUser());
  const chosenAvatar = avatarPath === undefined
    ? current.avatar
    : String(avatarPath || "").trim();
  if (!chosenAvatar && !allowEmptyAvatar) throw new Error("请选择微信头像");
  let avatarImage = "";
  if (chosenAvatar) {
    if (hasPersistentAvatar(chosenAvatar)) {
      avatarImage = chosenAvatar;
    } else {
      await ensureLocalAvatarExists(chosenAvatar);
      avatarImage = await uploadWechatAvatar(chosenAvatar);
    }
  }
  const data = { name: safeName, avatar_image: avatarImage };
  if (typeof gender === "string") data.gender = gender;
  const responseUser = await request({
    method: "PATCH",
    url: "/api/users/me",
    data
  });
  const user = normalizeWechatProfileUser({ ...current, ...responseUser, avatar_image: avatarImage });
  const payload = { token: getToken(), user };
  setSession(payload);
  const app = typeof getApp === "function" ? getApp() : null;
  if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
  else if (app) {
    app.globalData = app.globalData || {};
    app.globalData.token = getToken();
    app.globalData.user = user;
  }
  return user;
}

module.exports = {
  hasPersistentAvatar,
  isPlaceholderName,
  needsWechatProfileCompletion,
  normalizeWechatProfileUser,
  saveWechatProfile
};
