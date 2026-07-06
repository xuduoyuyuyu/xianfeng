const MIN_RATIO = 0.38;
const DEFAULT_RATIO = 0.48;
const MAX_RATIO = 0.82;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWindowHeight() {
  try {
    if (wx.getWindowInfo) {
      const info = wx.getWindowInfo();
      if (info && info.windowHeight) return Number(info.windowHeight);
    }
    const info = wx.getSystemInfoSync();
    if (info && info.windowHeight) return Number(info.windowHeight);
  } catch (_error) {}
  return 720;
}

function getFilterDrawerMetrics(options = {}) {
  const minRatio = Number(options.minRatio || MIN_RATIO);
  const defaultRatio = Number(options.defaultRatio || DEFAULT_RATIO);
  const maxRatio = Number(options.maxRatio || MAX_RATIO);
  const windowHeight = Math.max(560, getWindowHeight());
  const minHeight = Math.round(windowHeight * minRatio);
  const maxHeight = Math.round(windowHeight * maxRatio);
  const defaultHeight = clamp(Math.round(windowHeight * defaultRatio), minHeight, maxHeight);
  return {
    filterDrawerHeight: defaultHeight,
    filterDrawerMinHeight: minHeight,
    filterDrawerMaxHeight: maxHeight,
    filterDrawerDragStartY: 0,
    filterDrawerDragStartHeight: defaultHeight,
    filterDrawerDragMode: "",
    filterDrawerExpanded: defaultHeight >= maxHeight - 2
  };
}

function touchY(event) {
  const touch = event && event.touches && event.touches[0]
    ? event.touches[0]
    : event && event.changedTouches && event.changedTouches[0];
  return touch ? Number(touch.clientY || 0) : 0;
}

function createFilterDrawerMethods(options = {}) {
  return {
    openFilterDrawer() {
      this.setData({
        filterDrawerOpen: true,
        ...getFilterDrawerMetrics(options)
      });
    },

    closeFilterDrawer() {
      this.setData({ filterDrawerOpen: false });
    },

    onFilterDrawerTouchStart(event) {
      const metrics = getFilterDrawerMetrics(options);
      const mode = String(event && event.currentTarget && event.currentTarget.dataset && event.currentTarget.dataset.dragMode || "drawer");
      this.setData({
        filterDrawerDragStartY: touchY(event),
        filterDrawerDragStartHeight: this.data.filterDrawerHeight || metrics.filterDrawerHeight,
        filterDrawerMinHeight: this.data.filterDrawerMinHeight || metrics.filterDrawerMinHeight,
        filterDrawerMaxHeight: this.data.filterDrawerMaxHeight || metrics.filterDrawerMaxHeight,
        filterDrawerDragMode: mode
      });
    },

    onFilterDrawerTouchMove(event) {
      const startY = Number(this.data.filterDrawerDragStartY || 0);
      if (!startY) return;
      if (this.data.filterDrawerDragMode !== "handle" && this.data.filterDrawerExpanded) return;
      const startHeight = Number(this.data.filterDrawerDragStartHeight || this.data.filterDrawerHeight || 0);
      const minHeight = Number(this.data.filterDrawerMinHeight || 0);
      const maxHeight = Number(this.data.filterDrawerMaxHeight || 0);
      const nextHeight = clamp(startHeight + startY - touchY(event), minHeight, maxHeight);
      if (Math.abs(nextHeight - Number(this.data.filterDrawerHeight || 0)) < 1) return;
      this.setData({
        filterDrawerHeight: nextHeight,
        filterDrawerExpanded: nextHeight >= maxHeight - 2
      });
    },

    onFilterDrawerTouchEnd() {
      this.setData({
        filterDrawerDragStartY: 0,
        filterDrawerDragStartHeight: this.data.filterDrawerHeight || 0,
        filterDrawerDragMode: ""
      });
    }
  };
}

module.exports = {
  createFilterDrawerMethods,
  getFilterDrawerMetrics
};
