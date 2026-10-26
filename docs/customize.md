# 博客改造操作手册

这份手册教你在 `C:\blog` 里删内容、改文字、换配色、调布局，以及改完怎么发布。

---

## 0. 先理解三个层次

改博客前先分清你改的是哪一层：

| 层次 | 文件 | 改什么 |
| --- | --- | --- |
| 内容 | `src/content/posts/*.md`、`src/content/library/*.md` | 文章、资料条目 |
| 结构 | `src/pages/*.astro`、`src/components/*.astro`、`src/layouts/*.astro` | 页面有哪些区块、顺序、链接 |
| 外观 | `src/styles/global.css` | 颜色、字体、间距、圆角、动画 |

推荐流程：

```powershell
npm run dev        # 一边改一边看
# 改文件，保存后浏览器自动刷新
npm run build      # 改完确认能构建
git add . ; git commit -m "..." ; git push
```

`npm run dev` 会占住终端，停止按 `Ctrl + C`。要同时跑别的命令，就再开一个 PowerShell 窗口。

---

## 1. 删除示例文章（本仓库已执行）

示例内容清单：

```text
src/content/posts/why-i-record.md
src/content/posts/learning-loop.md
src/content/posts/weekly-review.md
src/content/posts/low-energy-version.md
src/content/posts/from-notes-to-action.md
src/content/posts/demo-math-notes.md
src/content/posts/assets/demo-diagram.png
src/content/library/demo-study-notes.md
public/files/demo-study-notes.pdf
```

删除命令（以后再遇到示例可以照用）：

```powershell
Remove-Item src/content/posts/why-i-record.md, learning-loop.md, weekly-review.md, low-energy-version.md, from-notes-to-action.md, demo-math-notes.md
Remove-Item src/content/posts/assets/demo-diagram.png -ErrorAction SilentlyContinue
Remove-Item src/content/library/demo-study-notes.md
Remove-Item public/files/demo-study-notes.pdf
```

删完跑一次 `npm run build`。标签页、RSS、sitemap、搜索索引都会自动重建，不需要手动清理。

> 首页现在支持 0 篇文章的状态：不会报错，会显示「还没有发布文章」的提示。

---

## 2. 文件地图

| 想改什么 | 打开 |
| --- | --- |
| 站名、英文名、浏览器标题、描述、作者、邮箱、导航 | `src/config.ts` |
| 首页大标题、副文案、按钮、右侧图片说明 | `src/pages/index.astro` |
| 首页最近更新条、文章时间轴 | `src/pages/index.astro` |
| 文章页布局、目录、阅读进度 | `src/pages/notes/[slug].astro` |
| 关于页 | `src/pages/about.astro` |
| 资料库列表 / PDF 阅读页 | `src/pages/library/index.astro`、`src/pages/library/[slug].astro` |
| 搜索页 | `src/pages/search.astro` |
| 页头、导航高亮、移动端菜单 | `src/components/SiteHeader.astro` |
| 文章卡片 | `src/components/PostCard.astro` |
| 图片灯箱 | `src/components/ImageLightbox.astro` |
| 全站颜色、字体、布局、动画 | `src/styles/global.css` |
| 全局 `<head>`、页脚 | `src/layouts/BaseLayout.astro` |
| 网站图标 | `public/favicon.svg` |
| 首页主视觉 | `public/images/growth-atlas.webp`（或 `npm run generate:cover`） |

---

## 3. 改站名和文字

### 3.1 站名、标题、作者、导航

编辑 `src/config.ts`：

```ts
export const siteConfig = {
  name: "Kostya 的学习笔记",   // 页头大字、页脚、文章标题后缀
  latinName: "STUDY LOG",      // 页头小字
  title: "Kostya · 学习笔记",  // 首页浏览器标签标题
  description: "微积分、线性代数和学习过程记录。",
  author: "Kostya",
  email: "you@example.com",
  startYear: 2026,
  nav: [
    { label: "首页", href: "/" },
    { label: "文章", href: "/#notes" },
    { label: "分类", href: "/categories" },
    { label: "资料库", href: "/library" },
    { label: "搜索", href: "/search" },
    { label: "关于", href: "/about" }
  ]
};
```

导航的**增删改**只改这个数组；页面顶部的「当前页」高亮逻辑在 `SiteHeader.astro` 里，普通路径不需要动。

### 3.2 首页标题和简介

`src/pages/index.astro` 里找到：

```astro
<h1>
  学习笔记
  <span>与资料归档</span>
</h1>
<p class="hero__lead">{siteConfig.description}</p>
```

- 大标题直接改文字；`<span>` 里的内容会用强调色（`--coral`）。
- 首页副标题直接读 `src/config.ts` 的 `description`，改配置就会同步显示在这里。
- 如果还想改页头、页脚、关于页文案，分别在 `SiteHeader.astro`、`BaseLayout.astro`、`about.astro`。

### 3.3 关于页 / 页脚

- 关于页：`src/pages/about.astro`，可以直接改标题、段落、原则列表。
- 页脚固定文案在 `src/layouts/BaseLayout.astro` 的 `<footer>` 里。

---

## 4. 改配色和字体

全站颜色都来自 `src/styles/global.css` 顶部的 CSS 变量：

```css
:root {
  --paper: #f7f6f2;        /* 页面底色 */
  --paper-bright: #ffffff; /* 卡片、输入框 */
  --paper-deep: #eceae3;   /* 次级底色 */
  --ink: #17202a;          /* 主文字 */
  --ink-soft: #2f3a44;     /* 正文 */
  --muted: #68727c;        /* 次要文字 */
  --line: rgba(23, 32, 42, 0.12);
  --line-strong: rgba(23, 32, 42, 0.28);
  --acid: #dde6ee;         /* 浅色块、选中 */
  --coral: #1f4e79;        /* 强调色（学术深蓝） */
  --sky: #cddbe6;
  --shell: 1120px;         /* 页面最大宽度 */
  --gutter: 28px;          /* 左右留白 */
  --font-display: "Local Display", "Songti SC", "STSong", "Noto Serif CJK SC", serif;
  --font-body: "Aptos", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
  --font-mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
}
```

深色模式在下面 `html[data-theme="dark"]` 里单独定义，**改浅色时记得同步改深色**，否则切换主题会难看。

### 换成蓝色的例子

```css
:root {
  --paper: #f4f7fb;
  --paper-bright: #ffffff;
  --paper-deep: #e3eaf4;
  --ink: #101b2d;
  --ink-soft: #24344d;
  --muted: #5d6d85;
  --acid: #b8e1ff;
  --coral: #2f6fed;
  --sky: #9ec5ff;
}

html[data-theme="dark"] {
  --paper: #0b1220;
  --paper-bright: #131c2e;
  --paper-deep: #1b2740;
  --ink: #eef4ff;
  --ink-soft: #c9d6ea;
  --muted: #93a4bd;
  --acid: #3b82f6;
  --coral: #7fb0ff;
  --sky: #60a5fa;
}
```

保存后自动生效。

### 换字体

现有字体全部用系统字体，不加载外部字体文件。

- 正文：改 `--font-body`，比如想用思源黑体：`"Source Han Sans SC", "Noto Sans CJK SC", sans-serif`。
- 标题：改 `--font-display`，比如 `"Noto Serif CJK SC", "Songti SC", serif`。
- 代码：改 `--font-mono`。

如果要用 webfont，需要把字体文件放进 `public/fonts/`，再在 `global.css` 顶部写 `@font-face`；这会让首屏变慢，简单改字体栈不用。

---

## 5. 改布局

### 5.1 首页有哪几块

`src/pages/index.astro` 从上到下：

```text
<BaseLayout>
  <section class="hero shell">          大标题 + 简介 + 按钮（纯文字）
  <section class="notes-section">       搜索框、分类筛选、文章列表
</BaseLayout>
```

- **不要整块删除 `notes-section`**，它是文章列表的载体。
- 想调整顺序，直接把整段 `<section>` 剪切到别的位置。
- 首页已经去掉了大图和「最近更新」条，保持纯文字学术风。

#### 例：调整标题大小和留白

在 `global.css` 末尾覆盖：

```css
.hero {
  padding-block: 56px 32px;
}

.hero h1 {
  font-size: clamp(2rem, 3.6vw, 3rem);
}
```

#### 例：恢复右侧大图

1. 在 `index.astro` 的 `</div>`（`.hero__copy` 结束）后加回 `<figure>`，图片放 `public/images/`。
2. 在 `global.css` 末尾加：

```css
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.82fr);
  gap: 56px;
  align-items: center;
}
```

### 5.2 改页面宽度

- 全站：改 `--shell`（当前 1120px）。
- 左右留白：改 `--gutter`（默认 28px）。
- 资料库、搜索页：`global.css` 里 `.simple-section` 和 `.simple-hero` 的 `max-width`。
- 文章正文：`.article-layout` 的栅格和 `.prose` 的 `max-width`。

想更窄更专注，可以把 `.simple-section`、`.simple-hero` 改成 `760px`。

### 5.3 文章页：隐藏右侧目录

`global.css` 末尾加：

```css
.article-aside {
  display: none;
}

.article-layout {
  grid-template-columns: minmax(0, 1fr);
  max-width: 760px;
}
```

### 5.4 把文章列表改成卡片网格

首页文章列表现在是一行一条的学术列表。想改成两列卡片：

```css
.timeline {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.timeline::before,
.timeline-post__rail {
  display: none;
}

.timeline-post {
  display: block;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.timeline-post__body {
  padding-left: 0;
}
```

### 5.5 新样式写在哪里

**建议写在 `global.css` 最末尾**，用同样的选择器覆盖，不要一上来就改几百行旧规则。这样出问题容易回退。

### 5.6 不要误删 `data-*` 属性

页面脚本靠这些属性工作：

| 页面 | 必须保留 |
| --- | --- |
| 首页 | `data-post`、`data-category`、`data-search`、`data-filter-category`、`data-search-input`、`data-result-count`、`data-empty-state` |
| 文章页 | `data-article-body`、`data-reading-progress`、`data-lightbox`、`data-lightbox-img` |
| 资料库 | `data-doc`、`data-doc-filter`、`data-doc-count`、`data-doc-empty`、`data-pdf-frame`、`data-base` |
| 搜索页 | `data-search-form`、`data-search-page-input`、`data-search-status`、`data-search-results` |
| 导航 | `data-menu-toggle`、`data-site-nav` |

改 HTML 结构时，这些属性要跟着保留，否则筛选、搜索、灯箱会失效。

### 5.7 新增一个页面

在 `src/pages/` 新建 `links.astro`：

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---

<BaseLayout title="友链">
  <section class="shell simple-hero">
    <p class="eyebrow">Links</p>
    <h1>友链</h1>
    <p>这里放朋友的网站。</p>
  </section>

  <section class="shell simple-section">
    <ul class="doc-list">
      <li class="doc-row">示例条目</li>
    </ul>
  </section>
</BaseLayout>
```

然后在 `src/config.ts` 的 `nav` 里加：

```ts
{ label: "友链", href: "/links" }
```

保存后访问 `/links`。

---

### 5.8 用文件夹归类内容

顶栏现在只有「资料库」，笔记和文件按 `folder` 归类：

```text
微积分Ⅰ / 线性代数 / 保研资料 / 学习方法 / 其他
```

- 文件夹列表在 `src/data/folders.json`；
- 每篇笔记和每个文件条目用 frontmatter 的 `folder` 字段归属；
- 在工作台里拖动条目只改这个字段，URL 不变；
- 新建文件夹后，把条目拖进去即可；
- 文件夹里还有内容时不能删除。

源文件也可以用真实目录整理，但目录会出现在 URL 里：

```text
src/content/posts/微积分/02-极限的概念.md  →  /notes/微积分/02-极限的概念
```

已发布的文章不要随意移动或改名，否则旧链接会 404。
## 6. 改动画

当前学术主题已经在 `global.css` 末尾用 `.hero__copy > *, .hero__visual { animation: none; }` 关掉了首页入场动画，所以默认是静止的。

想重新打开，可以删掉末尾这段覆盖，或者在 `@media (prefers-reduced-motion: no-preference)` 里调整：

```css
.hero__copy > * { animation: rise-in 650ms both; }
.hero__visual { animation: visual-in 760ms 100ms both; }
```

**只让动画更快**：把 `650ms`、`760ms` 改小，比如 `300ms`。

**只去掉位移、保留淡入**：把 `transform` 那两行删掉。

其他 hover 位移在 `.timeline-post`、`.button` 等规则里；学术主题已经去掉了大部分位移和阴影。想全站静止可以在末尾加：

```css
* {
  transition-duration: 0.01ms !important;
}
```

不建议连 `transition` 一起删，按钮和链接会失去反馈。

---

## 7. 换图片和图标

| 位置 | 文件 |
| --- | --- |
| 浏览器标签图标 | `public/favicon.svg` |
| 分享卡片默认图 | `BaseLayout` 里 `image` 默认值 |
| 旧的首页主视觉 | `public/images/growth-atlas.webp`（学术版首页已不显示，仅保留文件） |
| 文章封面 | frontmatter `cover:`（暂时只用于数据，未渲染） |

学术版首页是纯文字，没有大图。想加回图片或更换分享图，参考 5.1 的「恢复右侧大图」，并保持竖图比例（约 4:5）。

想重新生成抽象封面图（可作分享图）：

```powershell
npm run generate:cover
```

---

## 8. 预览与发布

```powershell
npm run dev        # 本地开发，改完自动刷新
npm run build      # 正式构建，必须通过
npm run preview    # 预览 dist 构建结果
```

发布：

```powershell
git add .
git commit -m "改标题和配色"
git push
```

- Vercel 会自动构建，**不需要手动 Redeploy**。
- 1–2 分钟后刷新 `https://first-blog-wine.vercel.app` 即可。
- 只有改了 Vercel 环境变量（如 `SITE_URL`）才需要去 Deployments 里 Redeploy。
- 推送时 Clash 要开着，否则连接 GitHub 超时。

---

## 9. 重复导入与去重

导入脚本现在会**跳过已存在的同名文章**，重复运行不会再多出副本。

历史上已经产生的重复文件可以这样找：

```powershell
Get-ChildItem src/content/posts -Filter *.md |
  Group-Object { $_.BaseName -replace '-\d+$', '' } |
  Where-Object Count -gt 1 |
  Select-Object Name, Count
```

当前仓库里可能有三组重复（`00-微积分I导航`、`00-首页`、`99-考前速查清单`）。处理原则：

1. 打开同组的几个文件，比较内容；
2. 保留内部链接指向最新版本的那一个；
3. 删掉其余的；
4. `npm run build` 确认没有断链。

想重新导入并覆盖已有版本：

```powershell
npm run import -- --vault "..." --force
```

---

## 10. 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| `PDF file is missing` | `public/files/` 里没有对应 PDF，或 `library` 条目的 `file` 写错 |
| 首页空白、构建报错 | frontmatter 缺 `title` 或 `pubDate`；检查 `src/content/posts/` |
| 搜索不到新内容 | 需要重新 `npm run build`；确认文章不是 `draft: true` |
| 中文 URL 打不开 | 文件名会影响 URL，尽量用稳定文件名；改文件名会变链接 |
| `npm run dev` 没反应 | 它是常驻进程，打开终端里的地址；停止按 `Ctrl + C` |
| 端口被占用 | 换端口：`npm run dev -- --port 4400` |
| `git push` 超时 | 打开 Clash；或检查 `git config --global --get http.https://github.com.proxy` |
| 线上没更新 | 看 Vercel Deployments 是否构建失败；失败时线上仍是旧版本 |
| 深色模式颜色不对 | 同步修改 `html[data-theme="dark"]` 里的变量 |

---

## 11. 推荐改造顺序

1. `git commit` 一次，确保有回退点。
2. 删示例文章 → `npm run build`。
3. 改 `config.ts` 站名和导航 → 预览。
4. 改首页标题文案 → 预览。
5. 改配色变量 → 同时看浅色/深色。
6. 调布局（宽度、去图、隐藏目录）→ 预览。
7. 关闭不需要的动画。
8. `npm test` + `npm run build` 全过。
9. `git push`，等 Vercel 构建完成。
10. 手机和电脑各打开一次线上站点检查。

---

## 12. 改完自检清单

- [ ] 首页、文章页、资料库、搜索都能打开
- [ ] 手机宽度没有横向滚动
- [ ] 深色模式切换正常
- [ ] 公式、图片灯箱、PDF 阅读正常
- [ ] `npm test` 和 `npm run build` 通过
- [ ] 没有把隐私内容或未授权资料提交进仓库
