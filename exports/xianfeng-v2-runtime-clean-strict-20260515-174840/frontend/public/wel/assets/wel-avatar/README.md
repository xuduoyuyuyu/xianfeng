# Wel AI 助手头像文件夹

## 文件结构
```
assets/wel-avatar/
├── README.md          # 本说明文档
├── no-hat.png         # 首次介绍时显示的无帽子版本头像
├── 01.png             # 日常头像 1
├── 02.png             # 日常头像 2
├── 03.png             # 日常头像 3
├── 04.png             # 日常头像 4
└── 05.png             # 日常头像 5
```

## 头像规格建议
- 尺寸：48x48 像素（圆形显示）
- 格式：PNG（支持透明背景）
- 命名规范：两位数字编号，如 01.png, 02.png, 03.png...

## 如何添加新头像
1. 在本文件夹中添加新的头像图片文件，按照 `06.png`, `07.png` 等方式命名
2. 在 index.html 中的 `AVATAR_CONFIG.dailyAvatars` 数组中添加新图片文件名

示例：
```javascript
const AVATAR_CONFIG = {
  basePath: '/assets/wel-avatar/',
  noHatAvatar: 'no-hat.png',
  dailyAvatars: [
    '01.png',
    '02.png',
    '03.png',
    '04.png',
    '05.png',
    '06.png',  // 新增
  ]
};
```

## 注意事项
- 确保图片文件名与配置一致
- 建议使用透明背景的 PNG 格式以获得最佳效果
