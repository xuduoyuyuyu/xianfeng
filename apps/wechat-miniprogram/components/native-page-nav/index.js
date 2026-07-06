const { getNativeTopbarMetrics } = require("../../utils/nativeChrome");
const { goProgramsHome } = require("../../utils/nativePageNav");

const LOGO_HEIGHT_RPX = 56;

function buildTopbarState() {
  const metrics = getNativeTopbarMetrics();
  const topbarHeight = Math.max(72, Math.round(metrics.topbarHeight || 88));
  const windowWidth = Math.max(320, Number(metrics.windowWidth || 375));
  const logoHeight = Math.round((LOGO_HEIGHT_RPX * windowWidth) / 750);
  const capsuleHeight = Math.max(28, Math.round(metrics.capsuleHeight || 32));
  const searchButtonTop = Math.max(8, Math.round(metrics.searchButtonTop || 8));
  return {
    topbarHeight,
    logoHeight,
    logoTop: Math.max(0, Math.round(searchButtonTop + capsuleHeight / 2 - logoHeight / 2))
  };
}

Component({
  properties: {
    title: {
      type: String,
      value: "家长先疯"
    },
    selected: {
      type: Number,
      value: 0
    }
  },

  data: {
    topbarHeight: 88,
    logoTop: 10,
    logoHeight: 28,
    menuOpen: false,
    menuItems: [
      { text: "节目", page: "/pages/programs/index", tabIndex: 0 },
      { text: "及阅", page: "/pages/reading/index", tabIndex: 1 },
      { text: "小玩子", page: "/pages/xiaowanzi/index", tabIndex: 2 },
      { text: "智库", path: "/experts" },
      { text: "资料", page: "/pages/materials/index", tabIndex: 3 },
      { text: "规划", path: "/planning" },
      { text: "请教", page: "/pages/topics/index", tabIndex: 4 },
      { text: "知物", path: "/worthbuy" },
      { text: "Pro", path: "/pro" },
      { text: "我的", path: "/profile" }
    ]
  },

  lifetimes: {
    attached() {
      this.setData(buildTopbarState());
    }
  },

  methods: {
    openHome() {
      goProgramsHome();
    },

    toggleMenu() {
      this.setData({ menuOpen: !this.data.menuOpen });
    },

    closeMenu() {
      this.setData({ menuOpen: false });
    },

    handleMenuItemTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const item = this.data.menuItems[index];
      if (!item) return;
      this.setData({ menuOpen: false });
      this.triggerEvent("route", item);
    },

    openPage(page) {
      const stack = getCurrentPages();
      const current = stack.length ? `/${stack[stack.length - 1].route}` : "";
      if (current === page) return;
      wx.switchTab({ url: page });
    }
  }
});
