(function () {
  "use strict";

  const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  const boot = window.__PT_GEMINI_BOOT__ || {};
  const dataset = boot.dataset || { elements: [], models: [], categories: [] };
  const initialState = boot.state || {};
  const MODE = boot.mode || "panel";

  const BY_Z = new Map(dataset.elements.map((el) => [el.z, el]));
  const CAT_MAP = new Map(dataset.categories.map((cat) => [cat.id, cat]));
  const GEMINI_Z_ORDER = [1, 6, 10, 18, 19];

  const state = {
    activeModelZ: initialState.activeModelZ || 10,
    pinnedZ: initialState.pinnedZ !== undefined ? initialState.pinnedZ : 10,
    displayZ: initialState.pinnedZ || initialState.activeModelZ || 10,
    lang: initialState.lang || "bilingual",
    viewMode: "table", // "table" | "list"
    filter: "all",     // "all" | "gemini" | category id
    search: "",
    theme: "auto",     // "auto" | "dark" | "light"
  };

  function postToHost(msg) {
    if (vscode) {
      vscode.postMessage(msg);
    }
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const n = parseInt(clean, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function applyThemeAccent() {
    const modelEl = BY_Z.get(state.activeModelZ) || BY_Z.get(10);
    if (modelEl && modelEl.geminiModel) {
      document.documentElement.style.setProperty("--accent", modelEl.geminiModel.accent);
      document.documentElement.style.setProperty("--accent-rgb", modelEl.geminiModel.accentRgb);
    }
    document.body.setAttribute("data-theme", state.theme);
  }

  function formatName(el) {
    if (state.lang === "en") return el.nameEn;
    if (state.lang === "zh") return el.nameZh;
    return `${el.nameEn} · ${el.nameZh}`;
  }

  function formatTileName(el) {
    if (state.lang === "en") return el.nameEn;
    if (state.lang === "zh") return el.nameZh;
    return `${el.nameEn} ${el.nameZh}`;
  }

  function matchesElement(el) {
    if (state.filter === "gemini" && !el.isGemini) return false;
    if (state.filter !== "all" && state.filter !== "gemini" && el.category !== state.filter) return false;

    const q = state.search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(el.z) === q ||
      String(el.z).includes(q) ||
      el.symbol.toLowerCase().includes(q) ||
      el.nameEn.toLowerCase().includes(q) ||
      el.nameZh.toLowerCase().includes(q) ||
      el.tagEn.toLowerCase().includes(q) ||
      el.tagZh.toLowerCase().includes(q) ||
      el.descEn.toLowerCase().includes(q) ||
      el.descZh.toLowerCase().includes(q) ||
      (el.geminiModel && el.geminiModel.modelName.toLowerCase().includes(q))
    );
  }

  function selectModel(z) {
    const el = BY_Z.get(z);
    if (!el || !el.isGemini) return;
    state.activeModelZ = z;
    state.pinnedZ = z;
    state.displayZ = z;
    applyThemeAccent();
    postToHost({ type: "selectModel", z });
    render();
  }

  function selectElement(z) {
    state.pinnedZ = state.pinnedZ === z ? null : z;
    state.displayZ = z;
    const el = BY_Z.get(z);
    if (state.pinnedZ !== null && el && el.isGemini) {
      state.activeModelZ = z;
      applyThemeAccent();
      postToHost({ type: "selectModel", z });
    } else {
      postToHost({ type: "selectElement", z: state.pinnedZ });
    }
    render();
  }

  function cycleLang() {
    const order = ["bilingual", "zh", "en"];
    state.lang = order[(order.indexOf(state.lang) + 1) % order.length];
    postToHost({ type: "setLanguage", lang: state.lang });
    render();
  }

  function cycleTheme() {
    const order = ["auto", "dark", "light"];
    state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
    applyThemeAccent();
    render();
  }

  function getLangButtonLabel() {
    if (state.lang === "zh") return "仅中文";
    if (state.lang === "en") return "EN Only";
    return "中英双语";
  }

  function getThemeButtonLabel() {
    if (state.theme === "dark") return "深色";
    if (state.theme === "light") return "浅色";
    return "跟随 IDE";
  }

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderSidebar(root) {
    root.innerHTML = "";
    const shell = createEl("div", "pt-shell");

    const topBtn = createEl("button", "pt-btn is-primary", "展开大图 / Open Full Table");
    topBtn.type = "button";
    topBtn.style.width = "100%";
    topBtn.style.justifyContent = "center";
    topBtn.addEventListener("click", () => postToHost({ type: "openFullPanel" }));
    shell.appendChild(topBtn);

    const search = createEl("input", "pt-search");
    search.type = "text";
    search.style.width = "100%";
    search.placeholder = "搜索 118 元素 / 模型...";
    search.value = state.search;
    search.addEventListener("input", (e) => {
      state.search = e.target.value;
      renderSidebarList(listWrap);
    });
    shell.appendChild(search);

    const filterRow = createEl("div", "filter-strip");
    const btnAll = createEl("button", `cat-pill ${state.filter === "all" ? "is-active" : ""}`, "全部 118");
    btnAll.type = "button";
    btnAll.addEventListener("click", () => {
      state.filter = "all";
      render();
    });
    const btnGem = createEl("button", `cat-pill ${state.filter === "gemini" ? "is-active" : ""}`, "✦ 仅 5 彩蛋");
    btnGem.type = "button";
    btnGem.addEventListener("click", () => {
      state.filter = state.filter === "gemini" ? "all" : "gemini";
      render();
    });
    const btnLang = createEl("button", "cat-pill", getLangButtonLabel());
    btnLang.type = "button";
    btnLang.addEventListener("click", cycleLang);
    filterRow.append(btnAll, btnGem, btnLang);
    shell.appendChild(filterRow);

    const modelsWrap = createEl("div", "sidebar-models");
    dataset.models.forEach((m) => {
      const btn = createEl("button", `model-pill ${state.activeModelZ === m.z ? "is-active" : ""}`);
      btn.type = "button";
      btn.style.setProperty("--m-color", m.accent);
      btn.style.setProperty("--m-rgb", m.accentRgb);
      btn.innerHTML = `
        <span class="model-pill-sym">${m.symbol}</span>
        <span class="model-pill-info">
          <span class="model-pill-name">${m.modelName}</span>
          <span class="model-pill-sub">${m.z} · [${m.shortcut}]</span>
        </span>
      `;
      btn.addEventListener("click", () => {
        selectModel(m.z);
        postToHost({ type: "openFullPanel" });
      });
      modelsWrap.appendChild(btn);
    });
    shell.appendChild(modelsWrap);

    const listWrap = createEl("div", "sidebar-list");
    renderSidebarList(listWrap);
    shell.appendChild(listWrap);
    root.appendChild(shell);
  }

  function renderSidebarList(container) {
    container.innerHTML = "";
    const filtered = dataset.elements.filter(matchesElement);
    filtered.forEach((el) => {
      const cat = CAT_MAP.get(el.category);
      const card = createEl("button", `list-card ${el.isGemini ? "is-gemini" : ""} ${state.pinnedZ === el.z ? "is-pinned" : ""}`);
      card.type = "button";
      card.style.setProperty("--cat-color", cat.color);
      if (el.isGemini) {
        card.style.setProperty("--gem-color", el.geminiModel.accent);
        card.style.setProperty("--gem-rgb", el.geminiModel.accentRgb);
      }
      const desc = state.lang === "en" ? el.descEn : el.descZh;
      card.innerHTML = `
        <div class="list-card-head">
          <span class="list-card-sym">#${el.z} ${el.symbol} · ${formatName(el)}</span>
          <span>${el.isGemini ? (el.z === 19 ? "🍌" : "✦") : el.isOfficialQuote ? "📜" : ""}</span>
        </div>
        <div class="list-card-desc">${desc}</div>
      `;
      card.addEventListener("click", () => {
        postToHost({ type: "pinToStatusBar", z: el.z });
      });
      container.appendChild(card);
    });
  }

  function renderPanel(root) {
    root.innerHTML = "";
    const shell = createEl("div", "pt-shell");

    // Header
    const header = createEl("header", "pt-header");
    const brand = createEl("div", "pt-brand");
    brand.innerHTML = `
      <div class="pt-sparkle" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C12.8 8.2 15.8 11.2 22 12C15.8 12.8 12.8 15.8 12 22C11.2 15.8 8.2 12.8 2 12C8.2 11.2 11.2 8.2 12 2Z"/>
        </svg>
      </div>
      <div>
        <div class="pt-title">The Periodic Table of Gemini</div>
        <div class="pt-sub">118 Elements × 5 Gemini Easter Egg Models · Offline IDE Edition</div>
      </div>
    `;

    const controls = createEl("div", "pt-controls");
    const search = createEl("input", "pt-search");
    search.type = "text";
    search.id = "ptSearchInput";
    search.placeholder = "搜索 / 符号 / 序号 (/)";
    search.value = state.search;
    search.addEventListener("input", (e) => {
      state.search = e.target.value;
      if (state.search.trim()) {
        const first = dataset.elements.find(matchesElement);
        if (first) state.displayZ = first.z;
      }
      updateMainContent();
    });

    const viewBtn = createEl(
      "button",
      "pt-btn",
      state.viewMode === "table" ? "视图: 周期表" : "视图: 卡片清单"
    );
    viewBtn.type = "button";
    viewBtn.addEventListener("click", () => {
      state.viewMode = state.viewMode === "table" ? "list" : "table";
      render();
    });

    const onlyGemBtn = createEl(
      "button",
      `pt-btn ${state.filter === "gemini" ? "is-active" : ""}`,
      "✦ 仅 5 彩蛋"
    );
    onlyGemBtn.type = "button";
    onlyGemBtn.addEventListener("click", () => {
      state.filter = state.filter === "gemini" ? "all" : "gemini";
      render();
    });

    const langBtn = createEl("button", "pt-btn", getLangButtonLabel());
    langBtn.type = "button";
    langBtn.addEventListener("click", cycleLang);

    const themeBtn = createEl("button", "pt-btn", `主题: ${getThemeButtonLabel()}`);
    themeBtn.type = "button";
    themeBtn.addEventListener("click", cycleTheme);

    controls.append(search, viewBtn, onlyGemBtn, langBtn, themeBtn);
    header.append(brand, controls);
    shell.appendChild(header);

    // 5-Model Quick Switch Bar
    const modelsBar = createEl("div", "models-bar");
    dataset.models.forEach((m) => {
      const btn = createEl("button", `model-pill ${state.activeModelZ === m.z ? "is-active" : ""}`);
      btn.type = "button";
      btn.style.setProperty("--m-color", m.accent);
      btn.style.setProperty("--m-rgb", m.accentRgb);
      btn.innerHTML = `
        <span class="model-pill-sym">${m.symbol}</span>
        <span class="model-pill-info">
          <span class="model-pill-name">${m.modelName}</span>
          <span class="model-pill-sub">#${m.z} · 快捷键 ${m.shortcut}</span>
        </span>
      `;
      btn.addEventListener("click", () => selectModel(m.z));
      modelsBar.appendChild(btn);
    });
    shell.appendChild(modelsBar);

    // Category Filter Strip
    const filterStrip = createEl("div", "filter-strip");
    const allPill = createEl("button", `cat-pill ${state.filter === "all" ? "is-active" : ""}`, "全部 118");
    allPill.type = "button";
    allPill.addEventListener("click", () => {
      state.filter = "all";
      render();
    });
    filterStrip.appendChild(allPill);

    dataset.categories.forEach((cat) => {
      const btn = createEl("button", `cat-pill ${state.filter === cat.id ? "is-active" : ""}`);
      btn.type = "button";
      btn.innerHTML = `<span class="cat-dot" style="background:${cat.color};"></span><span>${state.lang === "en" ? cat.labelEn : cat.labelZh}</span>`;
      btn.addEventListener("click", () => {
        state.filter = state.filter === cat.id ? "all" : cat.id;
        render();
      });
      filterStrip.appendChild(btn);
    });

    const snQuickBtn = createEl("button", "cat-pill");
    snQuickBtn.type = "button";
    snQuickBtn.style.marginLeft = "auto";
    snQuickBtn.innerHTML = `<span class="cat-dot" style="background:#f59e0b;"></span><span>50 Sn 截图原文</span>`;
    snQuickBtn.addEventListener("click", () => {
      state.pinnedZ = 50;
      state.displayZ = 50;
      render();
    });
    filterStrip.appendChild(snQuickBtn);
    shell.appendChild(filterStrip);

    // Main Table / List Container + Detail Dock
    const mainWrap = createEl("div");
    const dockEl = createEl("section", "detail-dock");
    shell.append(mainWrap, dockEl);
    root.appendChild(shell);

    function updateMainContent() {
      mainWrap.innerHTML = "";
      if (state.viewMode === "table") {
        const tableWrap = createEl("div", "table-wrap");
        const grid = createEl("div", "ptable-grid");

        const activeModelEl = BY_Z.get(state.activeModelZ) || BY_Z.get(10);
        const callout = createEl("div", "grid-callout");
        callout.innerHTML = `
          <div class="grid-callout-title">
            <span style="color:${activeModelEl.geminiModel.accent};">✦</span>
            <span>${activeModelEl.geminiModel.modelName}</span>
            <span class="badge is-gemini">#${activeModelEl.z} ${activeModelEl.symbol}</span>
          </div>
          <div class="grid-callout-spec">${state.lang === "en" ? activeModelEl.geminiModel.specEn : activeModelEl.geminiModel.specZh}</div>
          <div class="grid-callout-actions">
            <button type="button" class="pt-btn" id="pinModelBtn">📌 固定到状态栏</button>
            <button type="button" class="pt-btn" id="copyModelBtn">📋 复制模型名</button>
          </div>
        `;
        grid.appendChild(callout);

        callout.querySelector("#pinModelBtn").addEventListener("click", () => {
          postToHost({ type: "pinToStatusBar", z: activeModelEl.z });
        });
        callout.querySelector("#copyModelBtn").addEventListener("click", () => {
          postToHost({ type: "copyText", text: activeModelEl.geminiModel.modelName });
        });

        const lanthM = createEl("button", "series-marker");
        lanthM.type = "button";
        lanthM.style.gridRow = "6";
        lanthM.style.gridColumn = "3";
        lanthM.textContent = "57–71";
        lanthM.addEventListener("click", () => {
          state.filter = state.filter === "lanthanide" ? "all" : "lanthanide";
          render();
        });

        const actM = createEl("button", "series-marker");
        actM.type = "button";
        actM.style.gridRow = "7";
        actM.style.gridColumn = "3";
        actM.textContent = "89–103";
        actM.addEventListener("click", () => {
          state.filter = state.filter === "actinide" ? "all" : "actinide";
          render();
        });

        const lanthL = createEl("button", "series-label", "镧系 57–71");
        lanthL.type = "button";
        lanthL.style.gridRow = "9";
        lanthL.style.gridColumn = "1 / 4";
        lanthL.addEventListener("click", () => {
          state.filter = state.filter === "lanthanide" ? "all" : "lanthanide";
          render();
        });

        const actL = createEl("button", "series-label", "锕系 89–103");
        actL.type = "button";
        actL.style.gridRow = "10";
        actL.style.gridColumn = "1 / 4";
        actL.addEventListener("click", () => {
          state.filter = state.filter === "actinide" ? "all" : "actinide";
          render();
        });

        grid.append(lanthM, actM, lanthL, actL);

        dataset.elements.forEach((el) => {
          const cat = CAT_MAP.get(el.category);
          const match = matchesElement(el);
          const tile = createEl(
            "button",
            `el-tile ${el.isGemini ? "is-gemini" : ""} ${state.pinnedZ === el.z ? "is-pinned" : ""} ${match ? "" : "is-dimmed"}`
          );
          tile.type = "button";
          tile.dataset.z = String(el.z);
          tile.style.gridRow = String(el.row);
          tile.style.gridColumn = String(el.col);
          tile.style.setProperty("--cat-color", cat.color);
          if (el.isGemini) {
            tile.style.setProperty("--gem-color", el.geminiModel.accent);
            tile.style.setProperty("--gem-rgb", el.geminiModel.accentRgb);
          }

          const rightIcon = el.isGemini
            ? el.z === 19
              ? `<span>🍌</span>`
              : `<span style="color:${el.geminiModel.accent};">✦</span>`
            : el.isOfficialQuote
            ? `<span class="tile-quote-dot" title="截图原文"></span>`
            : `<span class="tile-dot"></span>`;

          tile.innerHTML = `
            <div class="tile-top"><span>${el.z}</span>${rightIcon}</div>
            <div class="tile-sym">${el.symbol}</div>
            <div class="tile-name">${formatTileName(el)}</div>
          `;

          tile.addEventListener("mouseenter", () => {
            if (state.pinnedZ === null) {
              state.displayZ = el.z;
              renderDock(dockEl);
            }
          });
          tile.addEventListener("click", () => selectElement(el.z));
          grid.appendChild(tile);
        });

        tableWrap.appendChild(grid);
        mainWrap.appendChild(tableWrap);
      } else {
        const listGrid = createEl("div", "list-grid");
        dataset.elements.filter(matchesElement).forEach((el) => {
          const cat = CAT_MAP.get(el.category);
          const card = createEl(
            "button",
            `list-card ${el.isGemini ? "is-gemini" : ""} ${state.pinnedZ === el.z ? "is-pinned" : ""}`
          );
          card.type = "button";
          card.style.setProperty("--cat-color", cat.color);
          if (el.isGemini) {
            card.style.setProperty("--gem-color", el.geminiModel.accent);
            card.style.setProperty("--gem-rgb", el.geminiModel.accentRgb);
          }
          card.innerHTML = `
            <div class="list-card-head">
              <span class="list-card-sym">#${el.z} ${el.symbol} · ${formatName(el)}</span>
              <span>${el.isGemini ? el.geminiModel.modelName : el.mass}</span>
            </div>
            <div class="list-card-desc">${state.lang === "en" ? el.descEn : el.descZh}</div>
          `;
          card.addEventListener("click", () => selectElement(el.z));
          listGrid.appendChild(card);
        });
        mainWrap.appendChild(listGrid);
      }
      renderDock(dockEl);
    }

    updateMainContent();
  }

  function renderDock(dockEl) {
    const el = BY_Z.get(state.displayZ) || BY_Z.get(10);
    const cat = CAT_MAP.get(el.category);
    const dockColor = el.isGemini ? el.geminiModel.accent : cat.color;
    const dockRgb = el.isGemini ? el.geminiModel.accentRgb : hexToRgb(cat.color);

    dockEl.style.setProperty("--dock-color", dockColor);
    dockEl.style.setProperty("--dock-rgb", dockRgb);

    const tagText =
      state.lang === "en"
        ? el.tagEn
        : state.lang === "zh"
        ? el.tagZh
        : el.tagEn === el.tagZh
        ? el.tagEn
        : `${el.tagEn} · ${el.tagZh}`;

    const descHtml =
      state.lang === "en"
        ? `<div class="dock-desc">${el.descEn}</div>`
        : state.lang === "zh"
        ? `<div class="dock-desc">${el.descZh}</div>`
        : `<div class="dock-desc">${el.descEn}</div><div class="dock-desc-sub">${el.descZh}</div>`;

    dockEl.innerHTML = `
      <div class="dock-tile">
        <div class="dock-z">#${el.z}</div>
        <div class="dock-sym">${el.symbol}</div>
        <div class="dock-mass">${el.mass}</div>
      </div>
      <div class="dock-content">
        <div class="dock-top">
          <div class="dock-title-wrap">
            <span class="dock-title">${formatName(el)}</span>
            ${el.isGemini ? `<span class="badge is-gemini">${el.z === 19 ? "🍌" : "✦"} ${el.geminiModel.modelName}</span>` : ""}
            ${el.isOfficialQuote ? `<span class="badge is-quote">截图原文 · Official Quote</span>` : ""}
            <span class="badge"><span class="cat-dot" style="background:${cat.color};"></span>${state.lang === "en" ? cat.labelEn : cat.labelZh}</span>
            <span class="badge">P${el.period} · G${el.group}</span>
          </div>
          <div class="dock-actions">
            <button type="button" class="pt-btn" id="dockPinStatusBtn">📌 固定到状态栏</button>
            ${el.isGemini ? `<button type="button" class="pt-btn" id="dockCopyBtn">📋 复制模型名</button>` : ""}
          </div>
        </div>
        <div class="dock-tag">${tagText}</div>
        ${descHtml}
      </div>
    `;

    dockEl.querySelector("#dockPinStatusBtn").addEventListener("click", () => {
      postToHost({ type: "pinToStatusBar", z: el.z });
    });
    const copyBtn = dockEl.querySelector("#dockCopyBtn");
    if (copyBtn && el.geminiModel) {
      copyBtn.addEventListener("click", () => {
        postToHost({ type: "copyText", text: el.geminiModel.modelName });
      });
    }
  }

  function render() {
    const root = document.getElementById("app");
    if (!root) return;
    if (MODE === "sidebar") {
      renderSidebar(root);
    } else {
      renderPanel(root);
    }
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || msg.type !== "syncState" || !msg.state) return;
    state.activeModelZ = msg.state.activeModelZ || state.activeModelZ;
    state.pinnedZ = msg.state.pinnedZ !== undefined ? msg.state.pinnedZ : state.pinnedZ;
    state.displayZ = state.pinnedZ !== null ? state.pinnedZ : state.activeModelZ;
    state.lang = msg.state.lang || state.lang;
    applyThemeAccent();
    render();
  });

  document.addEventListener("keydown", (e) => {
    const searchEl = document.getElementById("ptSearchInput");
    const inInput = document.activeElement && document.activeElement.tagName === "INPUT";

    if (e.key === "/" && !inInput && searchEl) {
      e.preventDefault();
      searchEl.focus();
      searchEl.select();
      return;
    }
    if (e.key === "Escape") {
      if (state.search) {
        state.search = "";
      } else if (state.filter !== "all") {
        state.filter = "all";
      } else if (state.pinnedZ !== null) {
        state.pinnedZ = null;
        postToHost({ type: "selectElement", z: null });
      }
      render();
      return;
    }
    if (inInput) return;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      const cur = state.pinnedZ !== null ? state.pinnedZ : state.displayZ;
      const next = cur < 118 ? cur + 1 : 1;
      state.pinnedZ = next;
      state.displayZ = next;
      postToHost({ type: "selectElement", z: next });
      render();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = state.pinnedZ !== null ? state.pinnedZ : state.displayZ;
      const prev = cur > 1 ? cur - 1 : 118;
      state.pinnedZ = prev;
      state.displayZ = prev;
      postToHost({ type: "selectElement", z: prev });
      render();
    } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
      selectModel(GEMINI_Z_ORDER[Number(e.key) - 1]);
    }
  });

  applyThemeAccent();
  render();
})();
