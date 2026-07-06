function setSelectedTab(page, selected, options) {
  if (!page || typeof page.getTabBar !== "function") return;
  const tabBar = page.getTabBar();
  if (tabBar && typeof tabBar.setData === "function") {
    tabBar.setData({
      selected,
      hidden: Boolean(options && options.hidden)
    });
  }
}

module.exports = {
  setSelectedTab
};
