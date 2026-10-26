const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
};

const showToast = (message) => {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3800);
};

let posts = [];
let docs = [];
let editingId = null;
let activeJob = null;
let jobTimer = null;

const todayValue = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

async function loadSummary() {
  const data = await api("/api/summary");
  return data;
}

function renderPosts(filter = "") {
  const list = $("#postList");
  list.innerHTML = "";
  const needle = filter.trim().toLowerCase();

  const visible = posts.filter((post) => {
    if (!needle) return true;
    return [post.title, post.description, post.category, ...(post.tags || [])]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "row-meta";
    empty.textContent = "没有匹配的文章。";
    list.append(empty);
    return;
  }

  for (const post of visible) {
    const row = document.createElement("article");
    row.className = "row";

    const main = document.createElement("div");
    main.className = "row-main";

    const title = document.createElement("button");
    title.className = "row-title";
    title.type = "button";
    title.textContent = post.title;
    title.addEventListener("click", () => openPost(post.id));

    const meta = document.createElement("p");
    meta.className = "row-meta";
    meta.textContent = [post.pubDate, post.category, ...(post.tags || [])].filter(Boolean).join(" · ");

    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "编辑";
    edit.addEventListener("click", () => openPost(post.id));

    const view = document.createElement("a");
    view.href = `http://localhost:4321/notes/${encodeURIComponent(post.id)}`;
    view.target = "_blank";
    view.rel = "noreferrer";
    view.textContent = "预览";

    actions.append(view, edit);
    row.append(main, actions);
    list.append(row);
  }
}

async function loadPosts() {
  posts = await api("/api/posts");
  renderPosts($("#postSearch").value);
}

async function openPost(id) {
  const post = await api(`/api/post?id=${encodeURIComponent(id)}`);
  editingId = id;
  $("#fTitle").value = post.title;
  $("#fCategory").value = post.category;
  $("#fDate").value = post.pubDate || todayValue();
  $("#fTags").value = (post.tags || []).join(", ");
  $("#fDescription").value = post.description;
  $("#fBody").value = post.body;
  $("#preview").classList.add("hidden");
  $("#fBody").classList.remove("hidden");
  $("#togglePreview").textContent = "预览";
  showEditor(true);
}

function showEditor(show) {
  $("#postEditor").classList.toggle("hidden", !show);
  $("#postList").classList.toggle("hidden", show);
  $("#postSearch").classList.toggle("hidden", show);
  $("#newPost").classList.toggle("hidden", show);
}

function newPost() {
  editingId = null;
  $("#fTitle").value = "";
  $("#fCategory").value = "";
  $("#fDate").value = todayValue();
  $("#fTags").value = "";
  $("#fDescription").value = "";
  $("#fBody").value = "";
  $("#preview").classList.add("hidden");
  $("#fBody").classList.remove("hidden");
  $("#togglePreview").textContent = "预览";
  showEditor(true);
}

async function savePost() {
  const title = $("#fTitle").value.trim();
  if (!title) {
    showToast("标题不能为空");
    return;
  }

  const payload = {
    id: editingId,
    title,
    category: $("#fCategory").value.trim() || "笔记",
    pubDate: $("#fDate").value || todayValue(),
    tags: $("#fTags").value,
    description: $("#fDescription").value.trim(),
    body: $("#fBody").value
  };

  try {
    const result = await api("/api/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    editingId = result.id;
    showToast("已保存。记得发布上线。");
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

async function removePost() {
  if (!editingId) return;
  if (!confirm("确定删除这篇文章？本操作不可撤销。")) return;

  try {
    await api(`/api/post?id=${encodeURIComponent(editingId)}`, { method: "DELETE" });
    editingId = null;
    showEditor(false);
    await loadPosts();
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

function renderDocs() {
  const list = $("#docList");
  list.innerHTML = "";

  if (docs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "row-meta";
    empty.textContent = "还没有资料。";
    list.append(empty);
    return;
  }

  for (const doc of docs) {
    const row = document.createElement("article");
    row.className = "row";

    const main = document.createElement("div");
    main.className = "row-main";

    const title = document.createElement("span");
    title.className = "row-title";
    title.textContent = doc.title;

    const meta = document.createElement("p");
    meta.className = "row-meta";
    meta.textContent = [doc.pubDate, doc.category, doc.file, `${(doc.bytes / 1024).toFixed(0)} KB`]
      .filter(Boolean)
      .join(" · ");

    main.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const view = document.createElement("a");
    view.href = `http://localhost:4321/library/${encodeURIComponent(doc.id)}`;
    view.target = "_blank";
    view.rel = "noreferrer";
    view.textContent = "预览";

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      if (!confirm(`删除资料「${doc.title}」及其文件？`)) return;
      try {
        await api(`/api/library?id=${encodeURIComponent(doc.id)}`, { method: "DELETE" });
        await loadDocs();
        showToast("已删除资料。");
      } catch (error) {
        showToast(error.message);
      }
    });

    actions.append(view, del);
    row.append(main, actions);
    list.append(row);
  }
}

async function loadDocs() {
  docs = await api("/api/library");
  renderDocs();
}

async function uploadFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    showToast(`${file.name} 超过 50MB，已跳过。`);
    return;
  }

  const params = new URLSearchParams({
    name: file.name,
    title: file.name.replace(/\.[^.]+$/, ""),
    category: $("#uploadCategory").value.trim() || "资料",
    tags: $("#uploadTags").value.trim()
  });

  const response = await fetch(`/api/upload?${params}`, {
    method: "POST",
    body: file
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "上传失败");

  if (data.kind === "inbox") {
    showToast(`${file.name} 已放入 inbox，请到「操作与日志」点「导入 inbox」。`);
  } else {
    showToast(`${file.name} 已加入资料库。`);
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  try {
    for (const file of files) {
      await uploadFile(file);
    }
    await loadDocs();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadSettings() {
  const config = await api("/api/config");
  $("#sName").value = config.name;
  $("#sLatin").value = config.latinName;
  $("#sTitle").value = config.title;
  $("#sDescription").value = config.description;
  $("#sHeroTitle").value = config.heroTitle;
  $("#sHeroSubtitle").value = config.heroSubtitle;
  $("#sFooter").value = config.footerNote;
  $("#sAuthor").value = config.author;
  $("#sEmail").value = config.email;
  $("#sYear").value = config.startYear;
}

async function saveSettings() {
  const patch = {
    name: $("#sName").value,
    latinName: $("#sLatin").value,
    title: $("#sTitle").value,
    description: $("#sDescription").value,
    heroTitle: $("#sHeroTitle").value,
    heroSubtitle: $("#sHeroSubtitle").value,
    footerNote: $("#sFooter").value,
    author: $("#sAuthor").value,
    email: $("#sEmail").value,
    startYear: Number($("#sYear").value) || new Date().getFullYear()
  };

  try {
    await api("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    showToast("设置已保存。记得发布上线。");
  } catch (error) {
    showToast(error.message);
  }
}

function switchTab(tab) {
  $$(".nav").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $$(".panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== `panel-${tab}`));

  if (tab === "library") loadDocs().catch((error) => showToast(error.message));
  if (tab === "settings") loadSettings().catch((error) => showToast(error.message));
  if (tab === "posts") loadPosts().catch((error) => showToast(error.message));
}

function appendLog(text) {
  const log = $("#jobLog");
  if (log.textContent === "等待操作…") log.textContent = "";
  log.textContent += `${text}\n`;
  log.scrollTop = log.scrollHeight;
}

async function startJob(action) {
  if (activeJob) {
    showToast("已有任务在运行，请稍候。");
    return;
  }

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

    $(".primary[data-job='deploy']")?.removeAttribute("disabled");
    activeJob = null;
    window.clearTimeout(jobTimer);

    if (data.status === "success") {
      showToast("任务完成。");
    } else {
      showToast("任务失败，请查看日志。");
    }

    await loadPosts();
  } catch (error) {
    showToast(error.message);
    activeJob = null;
  }
}

function bindEvents() {
  $$(".nav").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("#postSearch").addEventListener("input", (event) => renderPosts(event.target.value));
  $("#newPost").addEventListener("click", newPost);
  $("#savePost").addEventListener("click", savePost);
  $("#deletePost").addEventListener("click", removePost);
  $("#backToList").addEventListener("click", () => showEditor(false));
  $("#togglePreview").addEventListener("click", togglePreview);

  const zone = $("#dropZone");
  const input = $("#fileInput");
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => handleFiles(input.files));
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

  $$("[data-job]").forEach((button) => {
    button.addEventListener("click", () => startJob(button.dataset.job));
  });

  $("#deployTop").addEventListener("click", () => startJob("deploy"));
}

async function init() {
  bindEvents();
  try {
    await loadPosts();
  } catch (error) {
    showToast(error.message);
  }
}

init();
