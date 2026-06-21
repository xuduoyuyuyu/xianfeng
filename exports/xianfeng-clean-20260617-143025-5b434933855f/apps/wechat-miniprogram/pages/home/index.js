const { WEB_ROUTES } = require("../../utils/config");
const { openWeb } = require("../../utils/webview");

Page({
  data: {
    entries: [
      { title: "节目精选", text: "系统化收听家长成长内容", path: WEB_ROUTES.programs },
      { title: "学习资料", text: "按主题查找资料、书籍和工具", path: WEB_ROUTES.materials },
      { title: "全站搜索", text: "快速找到节目、嘉宾和主题", path: WEB_ROUTES.search }
    ]
  },

  openEntry(event) {
    const item = event.currentTarget.dataset.item;
    openWeb(item.path, item.title);
  }
});
