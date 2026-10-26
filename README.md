# 留痕 · 个人博客

一个用 Markdown 写作、Astro 构建的静态博客。支持学习笔记、LaTeX 公式、图片、PDF 资料库和中文全文搜索，可以免费部署到 Vercel。

## 快速开始

```powershell
npm install
npm run dev
```

打开终端提示的地址（通常是 `http://localhost:4321`）。停止：`Ctrl + C`。

## 常用命令

```powershell
npm run admin      # 打开本地写作台（推荐日常改内容）
npm run dev        # 本地实时预览
npm run build      # 构建到 dist/
npm run preview    # 预览构建结果
npm test           # 跑导入与搜索的单元测试
npm run new -- "标题" --category 方法 --tags 学习,复盘
npm run import     # 把 inbox/ 里的 Markdown、PDF、图片导入站点
```

## 日常改内容：用写作台

```powershell
npm run admin
```

浏览器会打开 **http://127.0.0.1:4322**，可以：

- 点开文章改标题、摘要、分类、标签和正文，带公式预览；
- 把 PDF / Word / PPT 拖进「资料」页，自动生成资料库条目；
- 改站名、简介、首页标题等设置；
- 点「发布上线」自动构建并 `git push`，不用记命令。

具体说明见 [写作台手册](docs/admin.md)。

## 内容放在哪

```text
src/content/posts/        Markdown 文章（文件名就是 URL）
src/content/library/      PDF 资料条目
src/assets/imported/      导入脚本压缩后的图片
public/files/             可直接下载的 PDF 等文件
src/pages/                首页、文章页、资料库、搜索、标签、RSS
src/plugins/katex.mjs     LaTeX 公式渲染
scripts/import-content.mjs 导入工具
docs/writing.md           写作说明
docs/admin.md             写作台使用说明
docs/deployment.md        部署与域名说明
```

## 写作

新建 `src/content/posts/我的笔记.md`：

```md
---
title: "极限的概念"
description: "从数列到函数的极限直觉与严格定义。"
pubDate: 2026-10-26
category: "微积分"
tags: ["极限", "第一章"]
---

正文从这里开始。行内公式 $a^2+b^2=c^2$，块公式：

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

发布后访问 `/notes/我的笔记`。完整字段、图片、PDF、草稿说明见 [写作说明](docs/writing.md)。

想删示例文章、改站名、配色、布局或动画，见 [改造手册](docs/customize.md)。

## 导入已有笔记（Obsidian）

先把待发布的 Markdown、图片、PDF 放进 `inbox/`，或直接指向 Obsidian 仓库。建议先预演：

```powershell
npm run import -- --dry-run
npm run import -- --vault "C:\路径\你的Obsidian仓库" --dry-run
```

确认报告后再正式导入：

```powershell
npm run import -- --vault "C:\路径\你的Obsidian仓库"
```

转换规则：

- `![[图片.png]]` → 压缩为 WebP，按内容去重，正文使用相对路径；
- `[[讲义.pdf#page=2|第 2 页]]` → `/library/讲义#page=2`；
- `[[另一篇笔记|别名]]` → `/notes/另一篇笔记`；
- `> [!quote]- 标题` → `> **标题**`（当前不做折叠）；
- 删除 `%% 注释 %%` 和块 ID；
- 超过 20MB 的 PDF 默认跳过（可用 `--max-pdf-mb` 调整）。

默认**只读源仓库**，不会修改 Obsidian 里的文件；导入报告写入 `import-report.json`。

## PDF 资料库

把 PDF 放进 `public/files/`，在 `src/content/library/` 建一个同名 Markdown 条目即可，详见 [写作说明](docs/writing.md#pdf)。列表页 `/library`，阅读页支持 `#page=N`。

## 搜索

`/search` 是构建时索引的全文搜索，支持中文子串和多关键词；首页搜索框回车也会跳转过去。

## 部署

推送到 GitHub，在 Vercel 导入仓库即可；域名只在第一次配置，之后每次 push 都会在原域名上更新。

完整步骤、域名购买、DNS、备案说明见 [部署文档](docs/deployment.md)。

## 说明

- 纯静态：没有数据库、没有登录、没有后端。
- 公开站点：任何拿到链接的人都能访问；不要放隐私内容或未授权资料。
- 当前版本以功能验证为主，新页面样式保持最简。
