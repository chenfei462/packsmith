#!/usr/bin/env node

/**
 * generate.mjs - Static site generator for Packsmith pack catalog.
 *
 * Generates a multi-language static site from registry/catalog.json + i18n data.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const distDir = resolve(__dirname, "dist");

const catalog = JSON.parse(readFileSync(resolve(root, "registry/catalog.json"), "utf8"));
const i18nConfig = JSON.parse(readFileSync(resolve(root, "i18n/config.json"), "utf8"));
const packs = catalog.packs;

const translations = { en: null };
for (const language of i18nConfig.languages) {
  const filePath = resolve(root, `i18n/${language}/catalog-descriptions.json`);

  if (existsSync(filePath)) {
    translations[language] = JSON.parse(readFileSync(filePath, "utf8"));
  }
}

const allLanguages = ["en", ...i18nConfig.languages];
const categories = [...new Set(packs.map((pack) => pack.category))].sort();
const targets = [...new Set(packs.flatMap((pack) => pack.targets))].sort();

const uiStrings = {
  en: { title: "Packsmith Registry", subtitle: "The package manager for AI agent workflows", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" },
  zh: { title: "Packsmith Registry", subtitle: "AI agent workflow registry", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" },
  ja: { title: "Packsmith Registry", subtitle: "AI agent workflow registry", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" },
  ko: { title: "Packsmith Registry", subtitle: "AI agent workflow registry", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" },
  es: { title: "Packsmith Registry", subtitle: "AI agent workflow registry", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" },
  fr: { title: "Packsmith Registry", subtitle: "AI agent workflow registry", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" },
  de: { title: "Packsmith Registry", subtitle: "AI agent workflow registry", search: "Search packs...", allCategories: "All Categories", allTargets: "All Targets", packs: "packs", runtimes: "runtimes", languages: "languages" }
};

mkdirSync(distDir, { recursive: true });

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeJsValue(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function getPackName(pack, language) {
  if (language === "en") {
    return pack.name;
  }

  return translations[language]?.[pack.id]?.name || pack.name;
}

function getPackDescription(pack, language) {
  if (language === "en") {
    return pack.description;
  }

  return translations[language]?.[pack.id]?.description || pack.description;
}

function categoryLabel(category) {
  return String(category)
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generateCSS() {
  return `
:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --border: #2a2d3a;
  --text: #e4e4e7;
  --text-muted: #9ca3af;
  --accent: #6366f1;
  --tag-bg: #1e293b;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
header { padding: 48px 0 32px; text-align: center; border-bottom: 1px solid var(--border); }
h1 { font-size: 2.5rem; margin: 0 0 8px; }
.subtitle { color: var(--text-muted); margin: 0 0 24px; }
.stats { display: flex; gap: 32px; justify-content: center; margin-top: 16px; }
.stat { text-align: center; }
.stat-value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 0.85rem; color: var(--text-muted); }
.lang-switcher { display: flex; gap: 8px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
.lang-switcher a { padding: 4px 12px; border-radius: 4px; text-decoration: none; color: var(--text-muted); border: 1px solid var(--border); font-size: 0.85rem; }
.lang-switcher a.active { color: var(--accent); border-color: var(--accent); }
.filters { padding: 24px 0; display: flex; gap: 16px; flex-wrap: wrap; align-items: center; }
.search { flex: 1; min-width: 200px; padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 1rem; }
.search:focus { outline: none; border-color: var(--accent); }
select { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 0.9rem; cursor: pointer; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; padding: 24px 0 48px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
.card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
.card-name { font-size: 1.1rem; font-weight: 600; }
.card-category { font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; background: var(--tag-bg); color: var(--text-muted); }
.card-desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 16px; min-height: 44px; }
.card-targets { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.target-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 3px; background: var(--tag-bg); color: var(--text-muted); }
.card-install { font-family: monospace; font-size: 0.8rem; padding: 8px 12px; background: var(--bg); border-radius: 6px; color: var(--accent); cursor: pointer; user-select: all; }
footer { text-align: center; padding: 32px 0; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
footer a { color: var(--accent); text-decoration: none; }
@media (max-width: 768px) { .grid { grid-template-columns: 1fr; } .filters { flex-direction: column; } h1 { font-size: 1.8rem; } }
`;
}

function generateJS(language) {
  const packData = packs.map((pack) => ({
    id: pack.id,
    name: getPackName(pack, language),
    description: getPackDescription(pack, language),
    category: pack.category,
    targets: pack.targets
  }));

  return `
const packs = ${serializeJsValue(packData)};
const searchInput = document.getElementById("search");
const categorySelect = document.getElementById("category");
const targetSelect = document.getElementById("target");
const grid = document.getElementById("grid");

function categoryTitle(value) {
  return String(value).split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function createTargetBadge(target) {
  const badge = document.createElement("span");
  badge.className = "target-badge";
  badge.textContent = target;
  return badge;
}

function createCard(pack) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.category = pack.category;

  const header = document.createElement("div");
  header.className = "card-header";

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = pack.name;

  const category = document.createElement("span");
  category.className = "card-category";
  category.textContent = categoryTitle(pack.category);

  header.append(name, category);

  const description = document.createElement("p");
  description.className = "card-desc";
  description.textContent = pack.description;

  const targets = document.createElement("div");
  targets.className = "card-targets";
  pack.targets.forEach((target) => targets.appendChild(createTargetBadge(target)));

  const install = document.createElement("div");
  install.className = "card-install";
  install.title = "Click to copy";
  install.textContent = "packsmith install " + pack.id;
  install.addEventListener("click", () => {
    void navigator.clipboard.writeText(install.textContent.trim());
    install.style.color = "#22c55e";
    setTimeout(() => {
      install.style.color = "";
    }, 1000);
  });

  card.append(header, description, targets, install);
  return card;
}

function render() {
  const q = searchInput.value.toLowerCase();
  const cat = categorySelect.value;
  const tgt = targetSelect.value;

  const filtered = packs.filter((pack) => {
    if (q && !pack.name.toLowerCase().includes(q) && !pack.description.toLowerCase().includes(q) && !pack.id.includes(q)) {
      return false;
    }

    if (cat && pack.category !== cat) {
      return false;
    }

    if (tgt && !pack.targets.includes(tgt)) {
      return false;
    }

    return true;
  });

  const fragment = document.createDocumentFragment();
  filtered.forEach((pack) => fragment.appendChild(createCard(pack)));
  grid.replaceChildren(fragment);
}

searchInput.addEventListener("input", render);
categorySelect.addEventListener("change", render);
targetSelect.addEventListener("change", render);
render();
`;
}

function generateHTML(language) {
  const ui = uiStrings[language] || uiStrings.en;
  const langPrefix = language === "en" ? "" : `/${language}`;

  const categoryOptions = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</option>`)
    .join("\n");

  const targetOptions = targets
    .map((target) => `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`)
    .join("\n");

  const langLinks = allLanguages
    .map((lang) => {
      const href = lang === "en" ? "/index.html" : `/${lang}/index.html`;
      const active = lang === language ? ' class="active"' : "";
      return `<a href="${escapeHtml(href)}"${active}>${escapeHtml(lang.toUpperCase())}</a>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(ui.title)} - ${escapeHtml(ui.subtitle)}</title>
  <meta name="description" content="${escapeHtml(`${ui.subtitle}. ${packs.length} ${ui.packs}, ${targets.length} ${ui.runtimes}, ${allLanguages.length} ${ui.languages}.`)}">
  <meta property="og:title" content="${escapeHtml(ui.title)}">
  <meta property="og:description" content="${escapeHtml(ui.subtitle)}">
  <meta property="og:type" content="website">
  <link rel="canonical" href="${escapeHtml(`https://packsmith.github.io/packsmith${langPrefix}/`)}">
  <style>${generateCSS()}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(ui.title)}</h1>
      <p class="subtitle">${escapeHtml(ui.subtitle)}</p>
      <div class="stats">
        <div class="stat"><div class="stat-value">${packs.length}</div><div class="stat-label">${escapeHtml(ui.packs)}</div></div>
        <div class="stat"><div class="stat-value">${targets.length}</div><div class="stat-label">${escapeHtml(ui.runtimes)}</div></div>
        <div class="stat"><div class="stat-value">${allLanguages.length}</div><div class="stat-label">${escapeHtml(ui.languages)}</div></div>
      </div>
      <div class="lang-switcher">
        ${langLinks}
      </div>
    </header>

    <div class="filters">
      <input type="text" id="search" class="search" placeholder="${escapeHtml(ui.search)}">
      <select id="category">
        <option value="">${escapeHtml(ui.allCategories)}</option>
        ${categoryOptions}
      </select>
      <select id="target">
        <option value="">${escapeHtml(ui.allTargets)}</option>
        ${targetOptions}
      </select>
    </div>

    <div id="grid" class="grid"></div>

    <footer>
      <p>Packsmith - ${escapeHtml(ui.subtitle)}</p>
      <p><a href="https://github.com/chenfei462/packsmith">GitHub</a> / <a href="https://www.npmjs.com/package/@packsmith/cli">npm</a></p>
    </footer>
  </div>
  <script>${generateJS(language)}</script>
</body>
</html>`;
}

for (const language of allLanguages) {
  const languageDir = language === "en" ? distDir : resolve(distDir, language);
  mkdirSync(languageDir, { recursive: true });
  writeFileSync(resolve(languageDir, "index.html"), generateHTML(language), "utf8");
  console.log(`Generated: ${language === "en" ? "" : `${language}/`}index.html`);
}

const assetsDir = resolve(__dirname, "assets");
if (existsSync(assetsDir)) {
  cpSync(assetsDir, resolve(distDir, "assets"), { recursive: true });
  console.log("Copied assets/");
}

console.log(`\nSite generated: ${distDir}`);
console.log(`Pages: ${allLanguages.length} languages x 1 page = ${allLanguages.length} HTML files`);
