import { readFileSync } from "node:fs";
import path from "node:path";

export function readFolderList(): string[] {
  try {
    const text = readFileSync(path.join(process.cwd(), "src", "data", "folders.json"), "utf8").replace(
      /^\uFEFF/,
      ""
    );
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parentOf(folder: string) {
  const index = folder.lastIndexOf("/");
  return index === -1 ? "" : folder.slice(0, index);
}

export function folderName(folder: string) {
  const index = folder.lastIndexOf("/");
  return index === -1 ? folder : folder.slice(index + 1);
}

export function folderDepth(folder: string) {
  return folder.split("/").filter(Boolean).length;
}

export function isInside(folder: string, parent: string) {
  return folder === parent || folder.startsWith(`${parent}/`);
}

export function collectFolders(explicit: string[], itemFolders: string[]): string[] {
  const set = new Set<string>();

  const add = (folder: string) => {
    const clean = folder.replace(/^\/+|\/+$/g, "");
    if (!clean) return;
    const parts = clean.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      set.add(current);
    }
  };

  explicit.forEach(add);
  itemFolders.filter(Boolean).forEach(add);

  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function directChildren(folders: string[], parent: string): string[] {
  return folders.filter((folder) => parentOf(folder) === parent);
}

export function folderHref(folder: string) {
  return `/library/folder/${encodeURI(folder)}`;
}

export function folderTrail(folder: string) {
  const parts = folder.split("/").filter(Boolean);
  return parts.map((name, index) => ({
    name,
    path: parts.slice(0, index + 1).join("/")
  }));
}
