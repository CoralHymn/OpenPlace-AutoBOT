# 骷髅打金服bot

wp.1515810.xyz 自动化工具，浏览器扩展形式，支持五种 Bot 模式。

## 功能

| Bot | 说明 |
|-----|------|
| 🚀 Auto-Launcher | Bot 模式选择器 |
| 🛡 Auto-Guard | 保护并自动修复像素画 |
| 🖼 Auto-Image | 根据图片自动绘制像素画 |
| 🌾 Auto-Farm | 自动耕种刷经验 |
| 🤝 Auto-Slave | 分布式协作绘制 |

## 安装

1. 打开 Chrome，访问 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目**根目录**（包含 `manifest.json` 的文件夹）

## 使用

打开 `wp.1515810.xyz`，页面右上角会出现悬浮面板，选择一个 Bot 即可启动。

> 面板支持鼠标拖拽移动。关闭面板后右下角会有 🎃 小按钮，点击可重新打开。

## 构建

```bash
npm install
npm run build:ext      # 生产构建
npm run build:ext:dev  # 开发构建（含 sourcemap）
```

## 打包分发

```bash
node pack-zip.mjs

node pack-userscript.mjs
```

会生成 `骷髅打金服-笨南瓜BOT.zip`，只含扩展所需文件，不含源码和开发依赖。

## 许可证

MIT
