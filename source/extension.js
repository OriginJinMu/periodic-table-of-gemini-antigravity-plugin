"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const VIEW_TYPE_PANEL = "periodicTableOfGemini.panel";
const VIEW_ID_SIDEBAR = "periodicTableOfGemini.sidebarView";
const STATE_KEYS = {
  activeModelZ: "ptGemini.activeModelZ",
  pinnedZ: "ptGemini.pinnedZ",
  lang: "ptGemini.lang",
};

/**
 * Load bundled 118-element dataset from media/elements.json.
 * @param {string} extensionPath
 */
function loadDataset(extensionPath) {
  const jsonPath = path.join(extensionPath, "media", "elements.json");
  const raw = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(raw);
}

/**
 * Generate a cryptographic nonce for Content Security Policy.
 */
function getNonce() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Safely serialize JSON for inline <script> injection.
 * @param {unknown} value
 */
function safeJsonStringify(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/**
 * Build the HTML document shared by both the main editor panel and the sidebar webview.
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @param {"panel" | "sidebar"} mode
 * @param {object} dataset
 * @param {object} state
 */
function buildWebviewHtml(webview, extensionUri, mode, dataset, state) {
  const mediaUri = vscode.Uri.joinPath(extensionUri, "media");
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "webview.css"));
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, "webview.js"));
  const nonce = getNonce();

  const initPayload = safeJsonStringify({
    mode,
    dataset,
    state,
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <title>The Periodic Table of Gemini</title>
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body data-mode="${mode}" data-theme="auto">
  <div id="app"></div>
  <script nonce="${nonce}">window.__PT_GEMINI_BOOT__ = ${initPayload};</script>
  <script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}

class SidebarViewProvider {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {object} dataset
   * @param {() => object} getState
   * @param {(msg: object) => Promise<void>} onMessage
   */
  constructor(context, dataset, getState, onMessage) {
    this.context = context;
    this.dataset = dataset;
    this.getState = getState;
    this.onMessage = onMessage;
    this._view = null;
  }

  /**
   * @param {vscode.WebviewView} webviewView
   */
  resolveWebviewView(webviewView) {
    this._view = webviewView;
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, "media");

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaUri],
    };

    webviewView.webview.html = buildWebviewHtml(
      webviewView.webview,
      this.context.extensionUri,
      "sidebar",
      this.dataset,
      this.getState()
    );

    webviewView.webview.onDidReceiveMessage((msg) => {
      this.onMessage(msg);
    });

    webviewView.onDidDispose(() => {
      this._view = null;
    });
  }

  /**
   * Push updated state to the sidebar webview when open.
   */
  syncState() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "syncState",
        state: this.getState(),
      });
    }
  }
}

class PeriodicTablePanel {
  /** @type {PeriodicTablePanel | null} */
  static currentPanel = null;

  /**
   * @param {vscode.WebviewPanel} panel
   * @param {vscode.ExtensionContext} context
   * @param {object} dataset
   * @param {() => object} getState
   * @param {(msg: object) => Promise<void>} onMessage
   */
  constructor(panel, context, dataset, getState, onMessage) {
    this.panel = panel;
    this.context = context;
    this.dataset = dataset;
    this.getState = getState;
    this.onMessage = onMessage;

    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    this.panel.webview.html = buildWebviewHtml(
      this.panel.webview,
      context.extensionUri,
      "panel",
      dataset,
      getState()
    );

    this.panel.webview.onDidReceiveMessage((msg) => {
      this.onMessage(msg);
    });

    this.panel.onDidDispose(() => {
      PeriodicTablePanel.currentPanel = null;
    });
  }

  /**
   * Reveal existing panel or create a new one in the active editor column.
   * @param {vscode.ExtensionContext} context
   * @param {object} dataset
   * @param {() => object} getState
   * @param {(msg: object) => Promise<void>} onMessage
   */
  static createOrShow(context, dataset, getState, onMessage) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : vscode.ViewColumn.One;

    if (PeriodicTablePanel.currentPanel) {
      PeriodicTablePanel.currentPanel.panel.reveal(column);
      PeriodicTablePanel.currentPanel.syncState();
      return PeriodicTablePanel.currentPanel;
    }

    const mediaUri = vscode.Uri.joinPath(context.extensionUri, "media");
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE_PANEL,
      "The Periodic Table of Gemini",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [mediaUri],
      }
    );

    PeriodicTablePanel.currentPanel = new PeriodicTablePanel(
      panel,
      context,
      dataset,
      getState,
      onMessage
    );
    return PeriodicTablePanel.currentPanel;
  }

  syncState() {
    this.panel.webview.postMessage({
      type: "syncState",
      state: this.getState(),
    });
  }
}

/**
 * Extension activation entry point.
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const dataset = loadDataset(context.extensionPath);
  const byZ = new Map(dataset.elements.map((el) => [el.z, el]));

  function readConfiguredLang() {
    const cfg = vscode.workspace.getConfiguration("periodicTableOfGemini");
    return cfg.get("defaultLanguage", "bilingual");
  }

  function getState() {
    const activeModelZ = context.globalState.get(STATE_KEYS.activeModelZ, 10);
    const pinnedZ = context.globalState.get(STATE_KEYS.pinnedZ, activeModelZ);
    const lang = context.globalState.get(STATE_KEYS.lang, readConfiguredLang());
    return {
      activeModelZ: byZ.has(activeModelZ) ? activeModelZ : 10,
      pinnedZ: pinnedZ === null || byZ.has(pinnedZ) ? pinnedZ : 10,
      lang: ["bilingual", "zh", "en"].includes(lang) ? lang : "bilingual",
    };
  }

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "periodicTableOfGemini.open";
  context.subscriptions.push(statusBarItem);

  function updateStatusBar() {
    const cfg = vscode.workspace.getConfiguration("periodicTableOfGemini");
    const visible = cfg.get("showStatusBar", true);
    if (!visible) {
      statusBarItem.hide();
      return;
    }
    const { activeModelZ, pinnedZ } = getState();
    const displayZ = pinnedZ !== null ? pinnedZ : activeModelZ;
    const el = byZ.get(displayZ) || byZ.get(10);
    const modelTag = el.geminiModel ? el.geminiModel.modelName : `${el.nameEn} · ${el.nameZh}`;
    statusBarItem.text = `$(sparkle) ${el.symbol} · ${modelTag}`;
    statusBarItem.tooltip = `#${el.z} ${el.symbol} (${el.nameEn} · ${el.nameZh})\n${el.tagZh}\n点击打开 The Periodic Table of Gemini (Ctrl+Alt+G)`;
    statusBarItem.show();
  }

  /** @type {SidebarViewProvider | null} */
  let sidebarProvider = null;

  function syncAllViews() {
    updateStatusBar();
    if (PeriodicTablePanel.currentPanel) {
      PeriodicTablePanel.currentPanel.syncState();
    }
    if (sidebarProvider) {
      sidebarProvider.syncState();
    }
  }

  /**
   * Handle webview messages from both panel and sidebar.
   * @param {object} msg
   */
  async function handleWebviewMessage(msg) {
    if (!msg || typeof msg.type !== "string") {
      return;
    }
    switch (msg.type) {
      case "selectElement": {
        const z = msg.z === null ? null : Number(msg.z);
        if (z === null || byZ.has(z)) {
          await context.globalState.update(STATE_KEYS.pinnedZ, z);
          syncAllViews();
        }
        break;
      }
      case "selectModel": {
        const z = Number(msg.z);
        const el = byZ.get(z);
        if (el && el.isGemini) {
          await context.globalState.update(STATE_KEYS.activeModelZ, z);
          await context.globalState.update(STATE_KEYS.pinnedZ, z);
          syncAllViews();
        }
        break;
      }
      case "pinToStatusBar": {
        const z = Number(msg.z);
        const el = byZ.get(z);
        if (el) {
          await context.globalState.update(STATE_KEYS.pinnedZ, z);
          if (el.isGemini) {
            await context.globalState.update(STATE_KEYS.activeModelZ, z);
          }
          syncAllViews();
          const label = el.geminiModel ? el.geminiModel.modelName : `${el.symbol} (${el.nameZh})`;
          vscode.window.setStatusBarMessage(`$(sparkle) 已固定到状态栏: ${label}`, 3000);
        }
        break;
      }
      case "copyText": {
        if (typeof msg.text === "string" && msg.text.length > 0) {
          await vscode.env.clipboard.writeText(msg.text);
          vscode.window.setStatusBarMessage(`已复制: ${msg.text}`, 2600);
        }
        break;
      }
      case "setLanguage": {
        if (["bilingual", "zh", "en"].includes(msg.lang)) {
          await context.globalState.update(STATE_KEYS.lang, msg.lang);
          syncAllViews();
        }
        break;
      }
      case "openFullPanel": {
        PeriodicTablePanel.createOrShow(context, dataset, getState, handleWebviewMessage);
        break;
      }
      default:
        break;
    }
  }

  sidebarProvider = new SidebarViewProvider(context, dataset, getState, handleWebviewMessage);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID_SIDEBAR, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("periodicTableOfGemini.open", () => {
      PeriodicTablePanel.createOrShow(context, dataset, getState, handleWebviewMessage);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("periodicTableOfGemini.quickPick", async () => {
      const geminiFirst = dataset.elements.filter((el) => el.isGemini);
      const others = dataset.elements.filter((el) => !el.isGemini);
      const ordered = [...geminiFirst, ...others];

      const items = ordered.map((el) => ({
        label: el.isGemini
          ? `$(sparkle) #${el.z} ${el.symbol} — ${el.geminiModel.modelName}`
          : `#${el.z} ${el.symbol} — ${el.nameEn} · ${el.nameZh}`,
        description: el.isGemini ? `${el.nameEn} · ${el.nameZh} | ${el.tagZh}` : el.tagRaw,
        detail: el.isGemini ? `${el.geminiModel.specZh} — ${el.descZh}` : `${el.descZh} | ${el.descEn}`,
        z: el.z,
        isGemini: el.isGemini,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title: "Periodic Table of Gemini — Quick Pick Element / Gemini Model",
        placeHolder: "输入原子序数、符号、中英文名或 Gemini 模型名（例如 Ne / Neon / 锡 / Banana）",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (!picked) {
        return;
      }
      await context.globalState.update(STATE_KEYS.pinnedZ, picked.z);
      if (picked.isGemini) {
        await context.globalState.update(STATE_KEYS.activeModelZ, picked.z);
      }
      syncAllViews();
      PeriodicTablePanel.createOrShow(context, dataset, getState, handleWebviewMessage);
    })
  );

  async function showRandomFact() {
    const idx = Math.floor(Math.random() * dataset.elements.length);
    const el = dataset.elements[idx];
    const headline = el.isGemini
      ? `✦ #${el.z} ${el.symbol} (${el.geminiModel.modelName}) — ${el.descZh}`
      : `#${el.z} ${el.symbol} (${el.nameEn} · ${el.nameZh}) — ${el.descZh} (${el.descEn})`;

    const choice = await vscode.window.showInformationMessage(
      headline,
      "在周期表中查看",
      "再来一条"
    );
    if (choice === "在周期表中查看") {
      await context.globalState.update(STATE_KEYS.pinnedZ, el.z);
      if (el.isGemini) {
        await context.globalState.update(STATE_KEYS.activeModelZ, el.z);
      }
      syncAllViews();
      PeriodicTablePanel.createOrShow(context, dataset, getState, handleWebviewMessage);
    } else if (choice === "再来一条") {
      await showRandomFact();
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("periodicTableOfGemini.randomFact", showRandomFact)
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("periodicTableOfGemini.showStatusBar")) {
        updateStatusBar();
      }
      if (e.affectsConfiguration("periodicTableOfGemini.defaultLanguage")) {
        context.globalState.update(STATE_KEYS.lang, readConfiguredLang());
        syncAllViews();
      }
    })
  );

  updateStatusBar();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
