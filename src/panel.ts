import * as vscode from 'vscode';
import { ValidationIssue } from './validator';
import { taxonomy } from './taxonomy';

export class WhiskerPanel {
  private _panel?: vscode.WebviewPanel;
  private _context: vscode.ExtensionContext;
  private _lastFileName = '';
  private _lastIssues: ValidationIssue[] = [];
  private _lastExistingTags: string[] = [];
  private _hasData = false;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  public show() {
    if (this._panel) { this._panel.reveal(vscode.ViewColumn.Two); return; }
    this._createPanel();
  }

  public update(fileName: string, issues: ValidationIssue[], existingTags: string[]) {
    this._lastFileName = fileName;
    this._lastIssues = issues;
    this._lastExistingTags = existingTags;
    this._hasData = true;
    if (!this._panel) { this._createPanel(); }
    this._send();
  }

  public clear() {
    this._hasData = false;
    if (this._panel) this._panel.webview.postMessage({ command: 'clear' });
  }

  private _createPanel() {
    this._panel = vscode.window.createWebviewPanel(
      'whisker', '🐱 Whisker',
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this._panel.webview.html = this._getHtml();

    this._panel.webview.onDidReceiveMessage(message => {
      if (message.command === 'addTag') {
        vscode.commands.executeCommand('whisker.addTag', message.tag);
      } else if (message.command === 'goToLine') {
        const editor = vscode.window.visibleTextEditors.find(e => e.document.languageId === 'markdown')
          ?? vscode.window.activeTextEditor;
        if (editor && message.line !== undefined) {
          const line = Math.min(message.line, editor.document.lineCount - 1);
          const pos = new vscode.Position(line, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          vscode.window.showTextDocument(editor.document, editor.viewColumn);
        }
      }
    }, undefined, this._context.subscriptions);

    this._panel.onDidDispose(() => { this._panel = undefined; }, undefined, this._context.subscriptions);

    if (this._hasData) this._send();
  }

  private _send() {
    if (!this._panel || !this._hasData) return;
    this._panel.webview.postMessage({
      command: 'update',
      fileName: this._lastFileName,
      issues: this._lastIssues,
      existingTags: this._lastExistingTags,
    });
  }

  private _getHtml(): string {
    // Serialize taxonomy for use in the webview
    const taxonomyJson = JSON.stringify(taxonomy);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      background: var(--vscode-titleBar-activeBackground, #1e1e1e);
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      flex-shrink: 0;
    }
    .header-title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
    .header-file { font-size: 11px; color: var(--vscode-descriptionForeground); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pills { display: flex; gap: 5px; flex-wrap: wrap; }
    .pill { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
    .pill.error   { background: #c72e2e; color: #fff; }
    .pill.warning { background: #8a6a00; color: #fff; }
    .pill.ok      { background: #2a7a2a; color: #fff; }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      flex-shrink: 0;
      background: var(--vscode-editorGroupHeader-tabsBackground);
    }
    .tab {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 12px;
      border-bottom: 2px solid transparent;
      color: var(--vscode-tab-inactiveForeground);
      user-select: none;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .tab:hover { background: var(--vscode-tab-hoverBackground); }
    .tab.active { border-bottom-color: var(--vscode-focusBorder, #007acc); color: var(--vscode-tab-activeForeground); }
    .content { flex: 1; overflow-y: auto; }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }
    .empty-state {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 200px; gap: 10px; opacity: 0.45; font-size: 12px; text-align: center; padding: 24px;
    }
    /* Issues */
    .issue-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 16px; cursor: pointer; border-left: 3px solid transparent;
      font-size: 12px; line-height: 1.5;
      border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    }
    .issue-item:hover { background: var(--vscode-list-hoverBackground); }
    .issue-item.error   { border-left-color: #c72e2e; }
    .issue-item.warning { border-left-color: #c8a000; }
    .issue-icon { flex-shrink: 0; padding-top: 1px; font-size: 14px; }
    .issue-text { flex: 1; word-break: break-word; }
    .issue-line { font-size: 10px; color: var(--vscode-descriptionForeground); margin-top: 3px; }
    .none { padding: 16px; font-size: 12px; color: #4caf50; }
    /* Tags by category */
    .category-block { border-bottom: 1px solid var(--vscode-panel-border, #333); }
    .category-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 7px 16px; cursor: pointer; user-select: none;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
      background: var(--vscode-sideBarSectionHeader-background);
    }
    .category-header:hover { background: var(--vscode-list-hoverBackground); }
    .category-chevron { font-size: 10px; transition: transform 0.15s; }
    .category-header.collapsed .category-chevron { transform: rotate(-90deg); }
    .category-body { display: block; }
    .category-body.hidden { display: none; }
    .tag-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 5px 16px 5px 24px; font-size: 12px; gap: 10px;
      border-bottom: 1px solid var(--vscode-panel-border, #1e1e1e);
    }
    .tag-item:hover { background: var(--vscode-list-hoverBackground); }
    .tag-item.added { opacity: 0.4; }
    .tag-name { flex: 1; }
    .add-btn {
      font-size: 10px; padding: 2px 8px; border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer; flex-shrink: 0;
    }
    .add-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .add-btn:disabled { opacity: 0.4; cursor: default; }
    .added-label { font-size: 10px; color: #4caf50; flex-shrink: 0; }
  </style>
</head>
<body>
  <div id="empty-state" class="empty-state">
    <div style="font-size:40px">🐱</div>
    <span>Open a blog .md file and Whisker will check it for you</span>
  </div>

  <div id="main" style="display:none; flex-direction:column; height:100%">
    <div class="header">
      <div class="header-title">🐱 Whisker</div>
      <div class="header-file" id="file-name"></div>
      <div class="pills" id="summary-pills"></div>
    </div>

    <div class="tabs">
      <div class="tab active" onclick="switchTab('errors')" id="tab-errors">
        Errors <span class="pill error" id="error-badge" style="font-size:9px">0</span>
      </div>
      <div class="tab" onclick="switchTab('warnings')" id="tab-warnings">
        Warnings <span class="pill warning" id="warning-badge" style="font-size:9px">0</span>
      </div>
      <div class="tab" onclick="switchTab('tags')" id="tab-tags">Tags</div>
    </div>

    <div class="content">
      <div class="tab-pane active" id="pane-errors"></div>
      <div class="tab-pane" id="pane-warnings"></div>
      <div class="tab-pane" id="pane-tags"></div>
    </div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const taxonomy = ${taxonomyJson};
  let existingTags = [];

  function switchTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    document.getElementById('pane-' + id).classList.add('active');
  }

  function updateSummary(errors, warnings) {
    const pills = document.getElementById('summary-pills');
    const parts = [];
    if (errors > 0)   parts.push(\`<span class="pill error">\${errors} error\${errors !== 1 ? 's' : ''}</span>\`);
    if (warnings > 0) parts.push(\`<span class="pill warning">\${warnings} warning\${warnings !== 1 ? 's' : ''}</span>\`);
    if (parts.length === 0) parts.push('<span class="pill ok">✓ All good</span>');
    pills.innerHTML = parts.join('');
  }

  function renderIssues(issues) {
    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');
    document.getElementById('error-badge').textContent = errors.length;
    document.getElementById('warning-badge').textContent = warnings.length;
    renderList('pane-errors', errors, 'error');
    renderList('pane-warnings', warnings, 'warning');
    return { errors: errors.length, warnings: warnings.length };
  }

  function renderList(id, items, type) {
    const el = document.getElementById(id);
    if (!items.length) { el.innerHTML = '<div class="none">✓ None</div>'; return; }
    el.innerHTML = items.map(i => \`
      <div class="issue-item \${type}" onclick="goToLine(\${i.line || 0})">
        <span class="issue-icon">\${type === 'error' ? '✕' : '⚠'}</span>
        <div class="issue-text">
          \${esc(i.message)}
          \${i.line != null ? '<div class="issue-line">Line ' + (i.line + 1) + '</div>' : ''}
        </div>
      </div>\`).join('');
  }

  function renderTags() {
    const el = document.getElementById('pane-tags');
    el.innerHTML = taxonomy.map((cat, i) => \`
      <div class="category-block">
        <div class="category-header" onclick="toggleCategory(\${i})" id="cat-header-\${i}">
          <span>\${esc(cat.name)}</span>
          <span class="category-chevron">▾</span>
        </div>
        <div class="category-body" id="cat-body-\${i}">
          \${cat.tags.map(tag => {
            const added = existingTags.map(t => t.toLowerCase()).includes(tag.toLowerCase());
            return \`<div class="tag-item\${added ? ' added' : ''}" id="tag-\${slugify(tag)}">
              <span class="tag-name">\${esc(tag)}</span>
              \${added
                ? '<span class="added-label">✓ added</span>'
                : \`<button class="add-btn" onclick="addTag('\${escAttr(tag)}')">+ Add</button>\`
              }
            </div>\`;
          }).join('')}
        </div>
      </div>\`).join('');
  }

  function toggleCategory(i) {
    const header = document.getElementById('cat-header-' + i);
    const body = document.getElementById('cat-body-' + i);
    header.classList.toggle('collapsed');
    body.classList.toggle('hidden');
  }

  function slugify(tag) {
    return tag.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  function goToLine(line) { vscode.postMessage({ command: 'goToLine', line }); }

  function addTag(tag) {
    vscode.postMessage({ command: 'addTag', tag });
    // Optimistically update UI
    existingTags.push(tag);
    const el = document.getElementById('tag-' + slugify(tag));
    if (el) {
      el.classList.add('added');
      el.querySelector('.add-btn').outerHTML = '<span class="added-label">✓ added</span>';
    }
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s) { return String(s).replace(/'/g, "\\'"); }

  window.addEventListener('message', ({ data }) => {
    if (data.command === 'update') {
      existingTags = data.existingTags || [];
      const emptyState = document.getElementById('empty-state');
      const main = document.getElementById('main');
      if (emptyState.style.display !== 'none') {
        emptyState.style.display = 'none';
        main.style.display = 'flex';
      }
      document.getElementById('file-name').textContent = data.fileName;
      const { errors, warnings } = renderIssues(data.issues);
      updateSummary(errors, warnings);
      renderTags();
    } else if (data.command === 'clear') {
      document.getElementById('empty-state').style.display = 'flex';
      document.getElementById('main').style.display = 'none';
    }
  });
</script>
</body>
</html>`;
  }
}
