# 投放目录

把要发布的文件放在这里，然后运行：

```powershell
npm run import -- --dry-run   # 先看预演报告
npm run import                # 正式导入
```

- `.md`：Markdown 笔记，会自动补 frontmatter、压缩图片、转换 Obsidian 链接。
- `.pdf`：自动复制到 `public/files/` 并生成资料库条目。
- 图片：如果被 Markdown 引用，会自动转 WebP。
- 导入成功后，源文件会移到 `_imported/`（不提交 git）。

也可以直接指向 Obsidian 仓库，不需要复制文件：

```powershell
npm run import -- --vault "C:\路径\仓库" --dry-run
```
