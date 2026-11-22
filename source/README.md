# The Periodic Table of Gemini (Antigravity IDE & VS Code Extension)

将 Google Gemini 网页端隐藏彩蛋 **The Periodic Table of Gemini** 带入 **Google Antigravity IDE** 与 **Visual Studio Code**：内置全部 118 个化学元素的中英双语科普与 5 大 Gemini 彩蛋模型切换器。

## 功能特性

- **118 元素完整交互周期表**：支持标准 18 列周期表视图与卡片清单双视图切换，含 `50 Sn（Tin · 锡）` 截图原文条目。
- **5 大 Gemini 彩蛋模型**：高亮展示 `1 H`（Gemini 4 Hydrogen）、`6 C`（Gemini 4 Carbon）、`10 Ne`（Gemini 4 Neon）、`18 Ar`（Gemini 4 Argon）、`19 K`（Nano Banana），支持快捷键 `1`–`5` 一键切换并固定到右下角状态栏。
- **侧边栏 & 命令面板联动**：左侧 Activity Bar 提供紧凑视图与「展开大图」按钮；命令面板支持 `Quick Pick` 模糊检索与 `Surprise Me` 随机元素科普。
- **纯离线零依赖**：全部 118 元素数据、样式与脚本均内置于 `.vsix` 扩展包，自动适配 IDE 深/浅色主题。

## 快捷键与设置

- 打开主周期表面板：`Ctrl+Alt+G`（macOS：`Cmd+Alt+G`）
- 面板内快捷键：`←` / `→` 切换相邻元素、`1`–`5` 速切 5 大彩蛋模型、`/` 聚焦搜索、`Esc` 清空搜索或取消锁定
- `settings.json` 配置项：
  - `periodicTableOfGemini.defaultLanguage`：`"bilingual"` | `"zh"` | `"en"`
  - `periodicTableOfGemini.showStatusBar`：`true` | `false`

## 作者

- **OriginJinMu** × **Gemini-Neon**
