import * as vscode from 'vscode';
import * as path from 'path';
import { validateArticle } from './validator';
import { WhiskerPanel } from './panel';

const BLOG_PATH_PATTERN = /blog.*\.md$/i;

export function activate(context: vscode.ExtensionContext) {
  const panel = new WhiskerPanel(context);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'whisker.validate';
  statusBar.text = '🐱 Whisker';
  statusBar.tooltip = 'Open Whisker panel';
  context.subscriptions.push(statusBar);

  const runOn = (doc: vscode.TextDocument) => {
    if (!isBlogPost(doc)) { panel.clear(); statusBar.hide(); return; }
    const content = doc.getText();
    const issues = validateArticle(content, getWorkspaceRoot());
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    let text = '🐱 Whisker';
    if (errors > 0) text += `  $(error) ${errors}`;
    if (warnings > 0) text += `  $(warning) ${warnings}`;
    if (errors === 0 && warnings === 0) text += '  $(check)';
    statusBar.text = text;
    statusBar.show();
    panel.update(path.basename(doc.fileName), issues, extractExistingTags(content));
  };

  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(runOn));
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor === undefined) return;
      runOn(editor.document);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('whisker.addTag', async (tag: string) => {
      const editor = vscode.window.activeTextEditor
        ?? vscode.window.visibleTextEditors.find(e => e.document.languageId === 'markdown');
      if (!editor) return;
      const doc = editor.document;
      const existing = extractExistingTags(doc.getText());
      if (existing.map((t: string) => t.toLowerCase()).includes(tag.toLowerCase())) return;
      await insertTags(doc, tag, existing);
      runOn(doc);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('whisker.validate', () => {
      const editor = vscode.window.activeTextEditor;
      panel.show();
      if (editor) runOn(editor.document);
    })
  );

  if (vscode.window.activeTextEditor) {
    runOn(vscode.window.activeTextEditor.document);
  }
}

function isBlogPost(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'markdown' && BLOG_PATH_PATTERN.test(doc.fileName);
}

function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

function extractExistingTags(content: string): string[] {
  // Handle inline: tags: [a, b, c]
  const inline = content.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) {
    return inline[1].split(',').map((t: string) => t.trim().replace(/['"]/g, '')).filter(Boolean);
  }
  // Handle multiline:
  // tags:
  //   - a
  //   - b
  const multiline = content.match(/^tags:\s*\n((?:[ \t]*-[ \t]+.+\n?)+)/m);
  if (multiline) {
    return multiline[1]
      .split('\n')
      .map((l: string) => l.replace(/^[ \t]*-[ \t]+/, '').trim().replace(/['"]/g, ''))
      .filter(Boolean);
  }
  return [];
}

async function insertTags(doc: vscode.TextDocument, newTag: string, existingTags: string[]) {
  const content = doc.getText();
  const allTags = [...existingTags, newTag];
  // Use the already-open editor rather than opening a new tab
  const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === doc.uri.toString());
  if (!editor) return;

  // Match inline tags: [...]
  const inlineMatch = content.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inlineMatch && inlineMatch.index !== undefined) {
    const newLine = `tags: [${allTags.join(', ')}]`;
    const start = doc.positionAt(inlineMatch.index);
    const end = doc.positionAt(inlineMatch.index + inlineMatch[0].length);
    await editor.edit(b => b.replace(new vscode.Range(start, end), newLine));
    return;
  }

  // Match multiline tags block
  const multilineMatch = content.match(/^tags:\s*\n((?:[ \t]*-[ \t]+.+\n?)+)/m);
  if (multilineMatch && multilineMatch.index !== undefined) {
    const newLine = `tags: [${allTags.join(', ')}]`;
    const start = doc.positionAt(multilineMatch.index);
    const end = doc.positionAt(multilineMatch.index + multilineMatch[0].length);
    await editor.edit(b => b.replace(new vscode.Range(start, end), newLine));
    return;
  }

  // No tags field — insert after description
  const descMatch = content.match(/^description:.*$/m);
  if (descMatch && descMatch.index !== undefined) {
    const insertPos = doc.positionAt(descMatch.index + descMatch[0].length);
    await editor.edit(b => b.insert(insertPos, `\ntags: [${newTag}]`));
  }
}

export function deactivate() {}
