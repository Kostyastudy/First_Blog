const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
};

let posts = [];
let docs = [];
let folders = [];
let selectedFolder = "全部";
let editingId = null;
let activeJob = null;
let jobTimer = null;

const showToast = (message) => {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
};

const todayValue = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const fileLabel = (file) => {
  const ext = String(file).toLowerCase().split(".").pop();
  if (ext === "pdf") return "PDF";
  if (ext === "docx" || ext === "doc") return "Word";
  if (ext === "pptx" || ext === "ppt") return "PPT";
  return "文件";
};

const isInside = (folder, parent) =>
  parent === "全部" || folder === parent || folder.startsWith(`${parent}/`);

const folderDepth = (folder) => folder.split("/").filter(Boolean).length;
const folderName = (folder) => folder.split("/").pop();

const allItems = () =>
  [
    ...posts.map((post) => ({
      source: "post",
      moveKind: "note",
      kind: post.kind === "material" ? "material" : "note",
      id: post.id,
      title: post.title,
      description: post.description,
      meta: post.category,
      date: post.pubDate,
      folder: post.folder || "其他",
      href: `http://localhost:4321/notes/${encodeURIComponent(post.id)}`
    })),
    ...docs.map((doc) => ({
      source: "doc",
      moveKind: "doc",
      kind: doc.kind === "note" ? "note" : "material",
      id: doc.id,
      title: doc.title,
      description: doc.description,
      meta: fileLabel(doc.file),
      date: doc.pubDate,
      folder: doc.folder || "其他",
      bytes: doc.bytes,
      href: `http://localhost:4321/library/${encodeURIComponent(doc.id)}`
    }))
  ];

function folderCount(name) {
  return allItems().filter((item) => isInside(item.folder, name)).length;
}

function renderFolders() {
  const list = $("#folderList");
  list.innerHTML = "";

  const all = document.createElement("button");
  all.type = "button";
  all.className = `folder-btn${selectedFolder === "全部" ? " active" : ""}`;
  all.innerHTML = `<span>全部</span><em>${folderCount("全部")}</em>`;
  all.addEventListener("click", () => selectFolder("全部"));
  list.append(all);

  const sorted = [...folders].sort((a, b) => a.localeCompare(b, "zh-CN"));

  for (const folder of sorted) {
    const depth = folderDepth(folder);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `folder-btn${selectedFolder === folder ? " active" : ""}`;
    button.style.paddingLeft = `${10 + (depth - 1) * 16}px`;
    button.title = folder;
    button.innerHTML = `<span class="folder-label"></span><em></em>`;
    button.querySelector(".folder-label").textContent = folderName(folder);
    button.querySelector("em").textContent = String(folderCount(folder));

    button.addEventListener("click", () => selectFolder(folder));
    button.addEventListener("dragover", (event) => {
      event.preventDefault();
      button.classList.add("drop");
    });
    button.addEventListener("dragleave", () => button.classList.remove("drop"));
    button.addEventListener("drop", async (event) => {
      event.preventDefault();
      button.classList.remove("drop");
      try {
        const payload = JSON.parse(event.dataTransfer.getData("text/plain"));
        await api("/api/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, folder })
        });
        await loadLibrary();
        showToast(`已移到「${folder}」`);
      } catch (error) {
        showToast(error.message);
      }
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "folder-remove";
    remove.textContent = "×";
    remove.title = "删除空文件夹";
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm(`删除文件夹「${folder}」？（只能删除空文件夹）`)) return;
      try {
        await api(`/api/folders?name=${encodeURIComponent(folder)}`, { method: "DELETE" });
        if (isInside(selectedFolder, folder)) selectedFolder = "全部";
        await loadLibrary();
        showToast("文件夹已删除。");
      } catch (error) {
        showToast(error.message);
      }
    });

    button.append(remove);
    list.append(button);
  }
}

function renderItems() {
  const list = $("#itemList");
  list.innerHTML = "";
  const query = $("#itemSearch").value.trim().toLowerCase();

  const visible = allItems()
    .filter((item) => isInside(item.folder, selectedFolder))
    .filter((item) =>
      !query ? true : [item.title, item.description, item.meta, item.folder].join(" ").toLowerCase().includes(query)
    )
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "row-meta";
    empty.textContent = "这个文件夹还没有内容。";
    list.append(empty);
    return;
  }

  for (const item of visible) {
    const row = document.createElement("article");
    row.className = "row";
    row.draggable = true;
    row.dataset.source = item.source;
    row.dataset.id = item.id;
    row.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ kind: item.moveKind, id: item.id })
      );
      event.dataTransfer.effectAllowed = "move";
    });

    const main = document.createElement("div");
    main.className = "row-main";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "row-title";
    title.textContent = item.title;
    title.addEventListener("click", () => {
      if (item.source === "post") openPost(item.id);
      else window.open(item.href, "_blank");
    });

    const meta = document.createElement("p");
    meta.className = "row-meta";
    meta.textContent = [
      item.kind === "note" ? "笔记" : "资料",
      item.meta,
      item.folder,
      item.date,
      item.bytes ? `${(item.bytes / 1024).toFixed(0)} KB` : ""
    ]
      .filter(Boolean)
      .join(" · ");

    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const open = document.createElement("a");
    open.href = item.href;
    open.target = "_blank";
    open.rel = "noreferrer";
    open.textContent = "打开";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "编辑";
    edit.addEventListener("click", () => {
      if (item.source === "post") openPost(item.id);
      else showToast("文件条目的标题请在「站点」或直接上传时设置；这里只支持移动和删除。");
    });

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      if (!confirm(`删除「${item.title}」？本操作不可撤销。`)) return;
      try {
        const url =
          item.source === "post"
            ? `/api/post?id=${encodeURIComponent(item.id)}`
            : `/api/library?id=${encodeURIComponent(item.id)}`;
        await api(url, { method: "DELETE" });
        await loadLibrary();
        showToast("已删除。");
      } catch (error) {
        showToast(error.message);
      }
    });

    actions.append(open, edit, del);
    row.append(main, actions);
    list.append(row);
  }
}

function selectFolder(name) {
  selectedFolder = name;
  $("#folderTitle").textContent = name === "全部" ? "全部内容" : name;
  $("#itemSearch").value = "";
  renderFolders();
  renderItems();
}

async function loadLibrary() {
  const [postList, docList, folderList] = await Promise.all([
    api("/api/posts"),
    api("/api/library"),
    api("/api/folders")
  ]);
  posts = postList;
  docs = docList;
  folders = folderList;
  renderFolders();
  renderItems();
  renderFolderOptions();
  if (selectedFolder === "全部") $("#folderTitle").textContent = "全部内容";
}

function renderFolderOptions() {
  const select = $("#fFolder");
  select.innerHTML = "";
  const sorted = [...folders].sort((a, b) => a.localeCompare(b, "zh-CN"));
  for (const folder of sorted) {
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = `${"— ".repeat(folderDepth(folder) - 1)}${folderName(folder)}`;
    select.append(option);
  }
}

function showEditor(show) {
  $("#postEditor").classList.toggle("hidden", !show);
  $("#itemList").classList.toggle("hidden", show);
  $("#itemSearch").classList.toggle("hidden", show);
  $("#dropZone").classList.toggle("hidden", show);
  $("#newNote").classList.toggle("hidden", show);
  $("#uploadBtn").classList.toggle("hidden", show);
}

function newNote() {
  editingId = null;
  $("#fTitle").value = "";
  $("#fCategory").value = "";
  $("#fDate").value = todayValue();
  $("#fTags").value = "";
  $("#fDescription").value = "";
  $("#fBody").value = "";
  $("#fFolder").value = selectedFolder === "全部" ? folders[0] || "其他" : selectedFolder;
  $("#preview").classList.add("hidden");
  $("#fBody").classList.remove("hidden");
  $("#togglePreview").textContent = "预览";
  showEditor(true);
}

async function openPost(id) {
  try {
    const post = await api(`/api/post?id=${encodeURIComponent(id)}`);
    editingId = id;
    $("#fTitle").value = post.title;
    $("#fCategory").value = post.category;
    $("#fDate").value = post.pubDate || todayValue();
    $("#fTags").value = (post.tags || []).join(", ");
    $("#fDescription").value = post.description;
    $("#fBody").value = post.body;
    $("#fFolder").value = post.folder || folders[0] || "其他";
    $("#preview").classList.add("hidden");
    $("#fBody").classList.remove("hidden");
    $("#togglePreview").textContent = "预览";
    showEditor(true);
  } catch (error) {
    showToast(error.message);
  }
}

async function savePost() {
  const title = $("#fTitle").value.trim();
  if (!title) return showToast("标题不能为空");

  try {
    const result = await api("/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        title,
        category: $("#fCategory").value.trim() || "笔记",
        folder: $("#fFolder").value || "其他",
        pubDate: $("#fDate").value || todayValue(),
        tags: $("#fTags").value,
        description: $("#fDescription").value.trim(),
        body: $("#fBody").value
      })
    });
    editingId = result.id;
    await loadLibrary();
    showToast(`已保存到「${$("#fFolder").value || "其他"}」。记得发布上线。`);
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteEditingPost() {
  if (!editingId) return;
  if (!confirm("确定删除这篇文章？")) return;
  try {
    await api(`/api/post?id=${encodeURIComponent(editingId)}`, { method: "DELETE" });
    editingId = null;
    showEditor(false);
    await loadLibrary();
    showToast("已删除。");
  } catch (error) {
    showToast(error.message);
  }
}

async function togglePreview() {
  const preview = $("#preview");
  const body = $("#fBody");

  if (!preview.classList.contains("hidden")) {
    preview.classList.add("hidden");
    body.classList.remove("hidden");
    $("#togglePreview").textContent = "预览";
    return;
  }

  try {
    const result = await api("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: body.value })
    });
    preview.innerHTML = result.html;
    preview.classList.remove("hidden");
    body.classList.add("hidden");
    $("#togglePreview").textContent = "编辑";
  } catch (error) {
    showToast(error.message);
  }
}

async function uploadFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    showToast(`${file.name} 超过 50MB，已跳过。`);
    return;
  }

  const folder = selectedFolder === "全部" ? "其他" : selectedFolder;
  const kind = $("#uploadKind").value === "note" ? "note" : "material";
  const params = new URLSearchParams({
    name: file.name,
    title: file.name.replace(/\.[^.]+$/, ""),
    category: folder,
    folder,
    kind,
    tags: ""
  });

  const response = await fetch(`/api/upload?${params}`, { method: "POST", body: file });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "上传失败");

  if (data.kind === "post") {
    showToast(`${file.name} 已作为笔记放到「${folder}」。`);
  } else if (data.kind === "inbox") {
    showToast(`${file.name} 已放入 inbox，请到「操作与日志」点「导入 inbox」。`);
  } else {
    showToast(`${file.name} 已放入「${folder}」。`);
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  try {
    for (const file of files) await uploadFile(file);
    await loadLibrary();
  } catch (error) {
    showToast(error.message);
  }
}

function addLinkRow(link = { label: "", url: "" }) {
  const row = document.createElement("div");
  row.className = "link-row";

  const label = document.createElement("input");
  label.className = "link-label";
  label.placeholder = "名称，例如 GitHub";
  label.value = link.label;

  const url = document.createElement("input");
  url.className = "link-url";
  url.placeholder = "https://... 或 mailto:...";
  url.value = link.url;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "mini danger-text";
  remove.textContent = "移除";
  remove.addEventListener("click", () => row.remove());

  row.append(label, url, remove);
  $("#aboutLinks").append(row);
}

async function loadSite() {
  const [config, about] = await Promise.all([api("/api/config"), api("/api/about")]);
  $("#sName").value = config.name;
  $("#sLatin").value = config.latinName;
  $("#sTitle").value = config.title;
  $("#sDescription").value = config.description;
  $("#sHomeIntro").value = config.homeIntro;
  $("#sHeroTitle").value = config.heroTitle;
  $("#sHeroSubtitle").value = config.heroSubtitle;
  $("#sFooter").value = config.footerNote;
  $("#sAuthor").value = config.author;
  $("#sEmail").value = config.email;
  $("#sYear").value = config.startYear;

  $("#aTitle").value = about.title;
  $("#aDescription").value = about.description;
  $("#aBody").value = about.body;
  $("#aboutLinks").innerHTML = "";
  for (const link of about.links) addLinkRow(link);
  if (about.links.length === 0) addLinkRow();
}

async function saveSettings() {
  try {
    await api("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("#sName").value,
        latinName: $("#sLatin").value,
        title: $("#sTitle").value,
        description: $("#sDescription").value,
        homeIntro: $("#sHomeIntro").value,
        heroTitle: $("#sHeroTitle").value,
        heroSubtitle: $("#sHeroSubtitle").value,
        footerNote: $("#sFooter").value,
        author: $("#sAuthor").value,
        email: $("#sEmail").value,
        startYear: Number($("#sYear").value) || new Date().getFullYear()
      })
    });
    showToast("站点信息已保存。记得发布上线。");
  } catch (error) {
    showToast(error.message);
  }
}

async function saveAbout() {
  const links = $$(".link-row").map((row) => ({
    label: row.querySelector(".link-label").value.trim(),
    url: row.querySelector(".link-url").value.trim()
  }));

  try {
    await api("/api/about", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: $("#aTitle").value,
        description: $("#aDescription").value,
        body: $("#aBody").value,
        links
      })
    });
    showToast("关于页已保存。记得发布上线。");
  } catch (error) {
    showToast(error.message);
  }
}

function switchTab(tab) {
  $$(".nav").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== `panel-${tab}`));
  if (tab === "library") loadLibrary().catch((error) => showToast(error.message));
  if (tab === "site") loadSite().catch((error) => showToast(error.message));
}

function appendLog(text) {
  const log = $("#jobLog");
  if (log.textContent === "等待操作…") log.textContent = "";
  log.textContent += `${text}\n`;
  log.scrollTop = log.scrollHeight;
}

async function startJob(action) {
  if (activeJob) return showToast("已有任务在运行，请稍候。");

  switchTab("jobs");
  $("#jobLog").textContent = "";
  appendLog(`启动：${action}`);

  try {
    const { id } = await api("/api/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    activeJob = { id, next: 0 };
    pollJob();
  } catch (error) {
    showToast(error.message);
  }
}

async function pollJob() {
  if (!activeJob) return;

  try {
    const data = await api(`/api/job/${activeJob.id}?since=${activeJob.next}`);
    for (const line of data.logs) appendLog(line);
    activeJob.next = data.next;

    if (data.status === "running") {
      jobTimer = window.setTimeout(pollJob, 700);
      return;
    }

    activeJob = null;
    window.clearTimeout(jobTimer);
    showToast(data.status === "success" ? "任务完成。" : "任务失败，请查看日志。");
    await loadLibrary().catch(() => {});
  } catch (error) {
    showToast(error.message);
    activeJob = null;
  }
}

async function refreshDevStatus() {
  try {
    const data = await api("/api/dev");
    const status = $("#devStatus");
    status.classList.toggle("on", data.running);
    status.innerHTML = `<i></i>${data.running ? "本地预览运行中" : "本地预览未启动"}`;
    $("#localLink").classList.toggle("disabled", !data.running);
  } catch {
    // admin server unavailable; leave status as is
  }
}

function bindEvents() {
  $$(".nav").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("#itemSearch").addEventListener("input", renderItems);

  $("#newFolder").addEventListener("click", async () => {
    const parent = selectedFolder === "全部" ? "" : selectedFolder;
    const name = prompt(
      parent
        ? `在「${parent}」下新建子文件夹，输入名称：`
        : "新建顶层文件夹，输入名称："
    );
    if (!name?.trim()) return;
    const fullPath = parent ? `${parent}/${name.trim()}` : name.trim();

    try {
      await api("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullPath })
      });
      await loadLibrary();
      selectFolder(fullPath);
      showToast("文件夹已创建。");
    } catch (error) {
      showToast(error.message);
    }
  });

  $("#newNote").addEventListener("click", newNote);
  $("#savePost").addEventListener("click", savePost);
  $("#deletePost").addEventListener("click", deleteEditingPost);
  $("#backToList").addEventListener("click", () => showEditor(false));
  $("#togglePreview").addEventListener("click", togglePreview);

  $("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", () => handleFiles($("#fileInput").files));

  const zone = $("#dropZone");
  zone.addEventListener("click", () => $("#fileInput").click());
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragging");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragging"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragging");
    handleFiles(event.dataTransfer.files);
  });

  $("#saveSettings").addEventListener("click", saveSettings);
  $("#saveAbout").addEventListener("click", saveAbout);
  $("#addLink").addEventListener("click", () => addLinkRow());

  $("#localLink").addEventListener("click", async (event) => {
    if (!event.currentTarget.classList.contains("disabled")) return;
    event.preventDefault();
    showToast("正在启动本地预览…");
    try {
      await api("/api/dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" })
      });
      setTimeout(refreshDevStatus, 1000);
    } catch (error) {
      showToast(error.message);
    }
  });

  $$("[data-job]").forEach((button) => {
    button.addEventListener("click", () => startJob(button.dataset.job));
  });

  $("#deployTop").addEventListener("click", () => startJob("deploy"));
}

async function init() {
  bindEvents();
  await loadLibrary().catch((error) => showToast(error.message));
  refreshDevStatus();
  window.setInterval(refreshDevStatus, 4000);
}

init();
