# AGENTS.md

本仓库是一个 Astro 静态博客（Windows，Node 24，npm）。

## 常用命令

```powershell
npm run build    # 必须通过
npm test         # node:test，导入与搜索
npm run dev      # 本地开发
npm run import -- --dry-run   # 导入预演
```

## 约定

- 内容编码统一 UTF-8；不要用 GBK 写文件。
- 文章在 `src/content/posts/`，资料条目在 `src/content/library/`。
- 图片放 `src/assets/` 或用相对路径引用，不要用 `public/` 做正文插图（不会压缩）。
- PDF 放 `public/files/`，文件名会被 URL 编码。
- 草稿用 `draft: true`，不要靠删除文件来隐藏。
- 不修改用户的 Obsidian 仓库；导入脚本只读源目录。
- 不提交 `dist/`、`.astro/`、`node_modules/`、`outputs/qa/`、`.env`、`inbox/_imported/`。
- 部署目标 Vercel；`SITE_URL` 是正式域名，未设置时回退 Vercel 环境变量。
- 视觉保持简单：新页面单列、复用现有 CSS 变量，不引入 UI 框架。
- 公式由 `src/plugins/katex.mjs` 渲染（Astro 默认 Sätteri 管线）。
- 搜索索引由 `src/pages/search-index.json.ts` 生成，前端逻辑在 `src/utils/search.js`。

## 完成定义

`npm test` 与 `npm run build` 均通过；新路由可访问；PDF 页面文件存在；不把大文件或隐私内容放进仓库。
