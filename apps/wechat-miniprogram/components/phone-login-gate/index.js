const { request } = require("../../utils/request");
const { setSession } = require("../../utils/session");
const { resolveAuthExpired } = require("../../utils/authExpiry");

Component({
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: "登录后继续" },
    description: { type: String, value: "点击授权手机号，登录后继续当前操作。" }
  },

  data: {
    bindingPhone: false,
    loginMessage: ""
  },

  methods: {
    loginWithPhone(event) {
      if (this.data.bindingPhone) return;
      const phoneCode = String(event && event.detail && event.detail.code || "");
      if (!phoneCode) {
        this.setData({ loginMessage: "需要授权手机号后登录" });
        return;
      }
      this.setData({ bindingPhone: true, loginMessage: "" });
      wx.login({
        success: ({ code }) => {
          if (!code) {
            this.setData({ bindingPhone: false, loginMessage: "微信登录失败，请重试" });
            return;
          }
          request({ method: "POST", url: "/api/wechat-mini/login", data: { code, phoneCode } })
            .then((payload) => {
              setSession(payload);
              const app = typeof getApp === "function" ? getApp() : null;
              if (app && typeof app.setLoginSession === "function") app.setLoginSession(payload);
              resolveAuthExpired();
              this.setData({ bindingPhone: false, loginMessage: "" });
              this.triggerEvent("success", { session: payload });
            })
            .catch((error) => {
              this.setData({ bindingPhone: false, loginMessage: String(error && error.message || "登录失败，请重试") });
            });
        },
        fail: () => this.setData({ bindingPhone: false, loginMessage: "无法调用微信登录" })
      });
    }
  }
});
