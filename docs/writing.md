# 写作与内容说明

## 新建一篇笔记

推荐用脚本：

```powershell
npm run new -- "极限的概念" --category 微积分 --tags 微积分,极限
```

会在 `src/content/posts/` 生成 `极限的概念.md`（文件名即 URL）。也可以手动新建文件。

## 文章头部（frontmatter）

```yaml
---
title: "标题"
description: "摘要；不写会自动取正文首段"
pubDate: 2026-10-26
updatedDate: 2026-10-27      # 可选
category: "微积分"
tags: ["极限", "第一章"]
featured: false              # 首页优先展示
draft: false                 # 草稿不会出现在列表、搜索、RSS
readingTime: "8 分钟"        # 可选，不写自动按字数估算
---
```

标题由页面模板渲染，正文里**不要再写一遍 `# 标题`**。

## 分类与文件夹

- `category` 是分类的唯一来源，`/categories` 和分类页按它归类。
- 可以按文件夹整理源文件：

  ```text
  src/content/posts/微积分/02-极限的概念.md  →  /notes/微积分/02-极限的概念
  ```

- 文件夹**不会**自动变成 `category`；仍然要在 frontmatter 写 `category: "微积分Ⅰ"`。
- Obsidian 导入时，源文件顶层文件夹会自动写入 `category`。
- 已发布的文章不要随意改名或移动，URL 会变；稳定链接比整理文件夹更重要。

## 图片

图片放在文章旁边或 `src/assets/` 下，用相对路径引用：

```md
![示意图](./assets/diagram.png)
```

- 构建时会自动压缩、生成响应式尺寸（WebP）。
- 文章内点击图片可放大，Esc 关闭。
- 不要引用 `public/` 下的图片作为正文插图，那样不会压缩。

## PDF

1. 把 PDF 放进 `public/files/`。
2. 在 `src/content/library/` 新建一个 `.md`，填写 `file` 路径：

```yaml
---
title: "线性代数笔记"
description: "课程讲义"
file: "/files/线性代数笔记.pdf"
pubDate: 2026-10-26
category: "资料"
tags: ["线性代数"]
bytes: 1067649
---
```

3. 访问 `/library` 查看列表，`/library/<文件名>` 阅读。

正文里链接 PDF：

```md
[打开第 2 页](/library/线性代数笔记#page=2)
```

## 公式与引用

- 行内公式 `$a^2+b^2=c^2$`，块公式 `$$ ... $$`，由 KaTeX 渲染。
- 普通引用用 `>`；Obsidian 的 `> [!quote]- 标题` 在导入时会变成 `> **标题**`（当前不做折叠）。
- 代码块右上角有复制按钮。

## 搜索

- 顶栏「搜索」或 `/search`，支持中文子串、多关键词、标题/标签加权。
- 首页搜索框回车会跳到全文搜索。
- 索引在构建时生成，新文章 push 后自动更新。

## 草稿

`draft: true` 的文章不会出现在首页、标签、搜索、RSS、sitemap；直接访问 `/notes/<文件名>` 仍可预览。
