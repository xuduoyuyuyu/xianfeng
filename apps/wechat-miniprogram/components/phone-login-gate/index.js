const { request } = require("../../utils/request");
const { setSession } = require("../../utils/session");
const { resolveAuthExpired } = require("../../utils/authExpiry");
const {
  hasPersistentAvatar,
  isPlaceholderName,
  needsWechatProfileCompletion,
  normalizeWechatProfileUser,
  saveWechatProfile: persistWechatProfile
} = require("../../utils/wechatProfile");

function failLogin(component, message, reason) {
  component.setData({ bindingPhone: false, loginMessage: message });
  component.triggerEvent("failure", { message, reason });
}

function finishLogin(component, payload) {
  component._pendingLoginSession = null;
  component.setData({
    completingProfile: false,
    savingProfile: false,
    profileMessage: ""
  });
  component.triggerEvent("success", { session: payload });
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: "登录后继续" },
    description: { type: String, value: "点击授权手机号，登录后继续当前操作。" }
  },

  data: {
    bindingPhone: false,
    loginMessage: "",
    completingProfile: false,
    savingProfile: false,
    profileName: "",
    profileAvatar: "",
    profileMessage: ""
  },

  methods: {
    loginWithPhone(event) {
      if (this.data.bindingPhone) return;
      const phoneCode = String(event && event.detail && event.detail.code || "");
      if (!phoneCode) {
        failLogin(this, "需要授权手机号后登录", "phone-denied");
        return;
      }
      this.setData({ bindingPhone: true, loginMessage: "" });
      wx.login({
        success: ({ code }) => {
          if (!code) {
            failLogin(this, "微信登录失败，请重试", "wx-code-missing");
            return;
          }
          request({ method: "POST", url: "/api/wechat-mini/login", data: { code, phoneCode } })
            .then((payload) => {
              setSession(payload);
              const app = typeof getApp === "function" ? getApp() : null;
              if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
              resolveAuthExpired();
              this.setData({ bindingPhone: false, loginMessage: "" });
              if (needsWechatProfileCompletion(payload && payload.user)) {
                const user = normalizeWechatProfileUser(payload && payload.user);
                this._pendingLoginSession = payload;
                this.setData({
                  completingProfile: true,
                  profileName: isPlaceholderName(user.name) ? "" : user.name,
                  profileAvatar: hasPersistentAvatar(user.avatar) ? user.avatar : "",
                  profileMessage: ""
                });
                return;
              }
              finishLogin(this, payload);
            })
            .catch((error) => {
              failLogin(this, String(error && error.message || "登录失败，请重试"), "request-failed");
            });
        },
        fail: () => failLogin(this, "无法调用微信登录", "wx-login-failed")
      });
    },

    chooseWechatAvatar(event) {
      const avatarUrl = String(event && event.detail && event.detail.avatarUrl || "").trim();
      if (avatarUrl) this.setData({ profileAvatar: avatarUrl, profileMessage: "" });
    },

    updateWechatNickname(event) {
      this.setData({ profileName: String(event && event.detail && event.detail.value || ""), profileMessage: "" });
    },

    saveWechatProfile() {
      if (this.data.savingProfile) return;
      this.setData({ savingProfile: true, profileMessage: "" });
      persistWechatProfile({
        name: this.data.profileName,
        avatarPath: this.data.profileAvatar
      })
        .then((user) => {
          const pending = this._pendingLoginSession || {};
          finishLogin(this, { ...pending, user });
        })
        .catch((error) => {
          this.setData({ savingProfile: false, profileMessage: String(error && error.message || "资料保存失败") });
        });
    },

    skipWechatProfile() {
      finishLogin(this, this._pendingLoginSession || {});
    }
  }
});
