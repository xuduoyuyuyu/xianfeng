const XIAOWANZI_ENTRY_MODE_KEY = "xf_xiaowanzi_entry_mode";
const READING_TAB_INDEX = 1;
const DOUBLE_TAP_INTERVAL_MS = 360;
const READING_LOGO_BOUNCE_MS = 520;
const { NATIVE_TABBAR_HEIGHT, getNativeTabbarMetrics } = require("../utils/nativeChrome");
const { rememberXiaowanziReturnPage } = require("../utils/xiaowanziReturn");
const { preloadReadingLandingData } = require("../utils/readingPreload");

Component({
  properties: {
    selected: {
      type: Number,
      value: 0
    },
    hidden: {
      type: Boolean,
      value: false
    }
  },

  data: {
    color: "#667085",
    selectedColor: "#6c27d6",
    safeBottom: 0,
    totalHeight: NATIVE_TABBAR_HEIGHT,
    readingLogoBouncing: false,
    list: [
      {
        pagePath: "/pages/programs/index",
        text: "节目",
        left: "0%",
        iconPath: "/assets/tabbar/programs.png",
        selectedIconPath: "/assets/tabbar/programs-active.png"
      },
      {
        pagePath: "/pages/reading/index",
        text: "及阅",
        left: "20%",
        iconPath: "/assets/tabbar/reading.png",
        selectedIconPath: "/assets/tabbar/reading-active.png"
      },
      {
        pagePath: "/pages/xiaowanzi/index",
        text: "",
        left: "40%",
        iconPath: "/assets/tabbar/xiaowanzi.png",
        selectedIconPath: "/assets/tabbar/xiaowanzi-active.png"
      },
      {
        pagePath: "/pages/materials/index",
        text: "资料",
        left: "60%",
        iconPath: "/assets/tabbar/materials.png",
        selectedIconPath: "/assets/tabbar/materials-active.png"
      },
      {
        pagePath: "/pages/topics/index",
        text: "请教",
        left: "80%",
        iconPath: "/assets/tabbar/topics.png",
        selectedIconPath: "/assets/tabbar/topics-active.png"
      }
    ]
  },

  lifetimes: {
    attached() {
      this.updateMetrics();
    }
  },

  pageLifetimes: {
    show() {
      this.updateMetrics();
    }
  },

  methods: {
    updateMetrics() {
      const metrics = getNativeTabbarMetrics();
      this.setData({
        safeBottom: metrics.safeBottom,
        totalHeight: metrics.totalHeight
      });
    },

    switchTab(event) {
      const dataset = (event && event.currentTarget && event.currentTarget.dataset)
        || (event && event.target && event.target.dataset)
        || {};
      const index = Number(dataset.index);
      const item = this.data.list[index];
      if (!item) return;
      if (index === READING_TAB_INDEX && this.data.selected === READING_TAB_INDEX) {
        if (this.isDoubleTap(index)) {
          this.triggerReadingLogoBounce();
          this.toggleReadingPageSource();
        }
        return;
      }
      this.rememberTap(index);
      if (index === READING_TAB_INDEX) preloadReadingLandingData();
      if (index === 2) {
        this.openXiaowanziSuper();
        return;
      }
      wx.switchTab({ url: item.pagePath });
    },

    rememberTap(index) {
      this._lastTapIndex = index;
      this._lastTapAt = Date.now();
    },

    isDoubleTap(index) {
      const now = Date.now();
      const isDoubleTap = this._lastTapIndex === index && now - this._lastTapAt <= DOUBLE_TAP_INTERVAL_MS;
      this._lastTapIndex = index;
      this._lastTapAt = now;
      return isDoubleTap;
    },

    triggerReadingLogoBounce() {
      if (this._readingLogoBounceTimer) clearTimeout(this._readingLogoBounceTimer);
      this.setData({ readingLogoBouncing: false }, () => {
        this.setData({ readingLogoBouncing: true });
      });
      this._readingLogoBounceTimer = setTimeout(() => {
        this.setData({ readingLogoBouncing: false });
      }, READING_LOGO_BOUNCE_MS);
    },

    toggleReadingPageSource() {
      const pages = typeof getCurrentPages === "function" ? getCurrentPages() : [];
      const currentPage = pages[pages.length - 1];
      if (currentPage && typeof currentPage.toggleReadingLibrarySource === "function") {
        currentPage.toggleReadingLibrarySource();
      }
    },

    openXiaowanziSuper() {
      const currentItem = this.data.list[this.data.selected];
      if (currentItem && currentItem.pagePath !== "/pages/xiaowanzi/index") {
        rememberXiaowanziReturnPage(currentItem.pagePath);
      }
      wx.setStorageSync(XIAOWANZI_ENTRY_MODE_KEY, "home");
      wx.switchTab({
        url: "/pages/xiaowanzi/index",
        success: () => {
          this.setData({ hidden: true });
        },
        fail: () => {
          this.setData({ hidden: false });
        }
      });
    }
  }
});
