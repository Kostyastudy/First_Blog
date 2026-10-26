# 部署与域名

目标：GitHub 存代码 → Vercel 自动构建 → 同一个域名持续更新。

## 0. 你需要准备

- 一个 GitHub 账号
- 一个 Vercel 账号（用 GitHub 登录即可）
- 一个域名（可选，先用 Vercel 免费域名也能上线）

## 1. 把代码推到 GitHub

在 GitHub 新建一个**空仓库**（不要勾选 README），然后在本目录执行：

```powershell
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

如果本机还没提交：

```powershell
git add .
git commit -m "init blog"
```

> 私有仓库也可以部署，Vercel 仍会生成公开站点。

## 2. 在 Vercel 导入

1. 打开 <https://vercel.com/new>，选择 `Import Git Repository`。
2. 选中刚推的仓库。
3. Framework Preset 应自动识别为 **Astro**；Build Command `npm run build`，Output Directory `dist`。
4. 在 **Environment Variables** 添加：
   - `SITE_URL` = `https://你的域名`（还没有域名时先填 Vercel 给的域名）
5. 点 **Deploy**，约 1–2 分钟。

部署完成后会得到 `https://<项目名>.vercel.app`，此时已经可以被任何人访问。

## 3. 绑定自定义域名

### 买域名

- 海外：Cloudflare Registrar、Porkbun、Namecheap（按成本价，支持信用卡/PayPal）。
- 国内：阿里云、腾讯云（需要实名认证；`.cn` 还需要额外资质）。
- 价格参考：`.com` 约 ¥70–100/年，`.me`/`.dev` 略高。

### 解析

1. Vercel 项目 → **Settings → Domains** → 添加 `blog.example.com`。
2. Vercel 会给出需要配置的 DNS 记录（通常是 `A` 或 `CNAME`）。
3. 到域名商的 DNS 面板照抄，**不要照抄本文档里的 IP**，以 Vercel 页面显示为准。
4. 等待生效与证书签发（通常几分钟到几小时）。
5. 把 `SITE_URL` 改成正式域名并重新部署（Deployments → Redeploy）。

### 关于备案

- 服务器在**中国大陆以外**（Vercel/Cloudflare/GitHub Pages）**不需要 ICP 备案**。
- 如果以后想迁到阿里云/腾讯云的大陆服务器或 OSS，则必须先完成 ICP 备案。
- 备案只影响大陆机房，不影响域名本身。

## 4. 日常更新流程

```powershell
npm run import        # 或直接改 src/content/posts
npm run build         # 本地检查
git add .
git commit -m "new post"
git push
```

Vercel 收到 push 后自动构建，把正式域名切到新版本：

- 域名、DNS 不变；
- 构建失败时线上仍是上一版；
- 旧文章链接不变；
- 首页、标签、RSS、搜索索引一起更新。

## 5. 备选托管

| 平台 | 优点 | 注意 |
| --- | --- | --- |
| Vercel | 识别 Astro，绑定域名简单 | 国内访问速度一般 |
| Cloudflare Pages | 免费无限带宽，国内通常略稳 | 单文件上限 25MB，大 PDF 要排除 |
| GitHub Pages | 完全免费 | 国内不稳定；需在仓库 Settings → Pages 选 GitHub Actions |

迁移到 Cloudflare Pages：新建项目连接同一仓库，构建命令 `npm run build`，输出目录 `dist`，再改 DNS 即可。

## 6. 体积与备份

- 仓库不建议超过 1GB；单个文件 GitHub 上限 100MB。
- 课程 PDF 请只放可公开的资料；教材扫描件注意版权。
- 代码和内容都在 git 里，GitHub 即备份；本地 `dist/` 不需要提交。
