#!/usr/bin/env node
const blessed = require('blessed');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'source', '_posts');
const BLOG_ROOT = path.join(__dirname, '..');
const HEXO_BIN = path.join(BLOG_ROOT, 'node_modules', 'hexo-cli', 'bin', 'hexo');

const screen = blessed.screen({
  smartCSR: true,
  title: 'Hexo 文章编辑器 (TUI)',
});

screen.key(['C-c'], () => process.exit(0));

const titleBox = blessed.textbox({
  parent: screen,
  label: ' 标题 (Enter 确认) ',
  top: 1,
  left: 1,
  width: '50%',
  height: 3,
  border: { type: 'line' },
  inputOnFocus: true,
  value: '',
});

const tagsBox = blessed.textbox({
  parent: screen,
  label: ' 标签 (逗号分隔) ',
  top: 1,
  left: '51%',
  width: '48%',
  height: 3,
  border: { type: 'line' },
  inputOnFocus: true,
  value: '',
});

const bodyBox = blessed.textarea({
  parent: screen,
  label: ' 正文 (Markdown, Ctrl-S 保存) ',
  top: 5,
  left: 1,
  width: '98%',
  height: '70%',
  border: { type: 'line' },
  inputOnFocus: true,
  value: '',
  scrollable: true,
  alwaysScroll: true,
  scrollbar: { ch: '|', inverse: true },
});

const statusBar = blessed.text({
  parent: screen,
  bottom: 1,
  left: 1,
  width: '98%',
  height: 1,
  content: 'Ctrl-S 保存并生成 | Ctrl-D 保存+生成+部署 | Esc 取消 | Ctrl-C 退出',
  style: { fg: 'cyan' },
});

function setStatus(msg) {
  statusBar.setContent(msg);
  screen.render();
}

function slugify(title) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
  return base;
}

function savePost({ deploy }) {
  const title = titleBox.value.trim();
  if (!title) {
    setStatus('[错误] 标题不能为空');
    return;
  }
  const tags = tagsBox.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  try {
    execSync(`node "${HEXO_BIN}" new "${title}"`, { cwd: BLOG_ROOT, stdio: 'pipe' });
  } catch (e) {
    setStatus('[错误] 创建文章失败: ' + e.message);
    return;
  }

  const fileName = slugify(title) + '.md';
  const filePath = path.join(POSTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    const candidates = fs
      .readdirSync(POSTS_DIR)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => fs.statSync(path.join(POSTS_DIR, b)).mtimeMs - fs.statSync(path.join(POSTS_DIR, a)).mtimeMs);
    if (candidates.length) {
      const target = candidates[0];
      if (target !== fileName) {
        fs.renameSync(path.join(POSTS_DIR, target), filePath);
      }
    }
  }

  const front = ['---', `title: ${title}`, `date: ${new Date().toISOString()}`, 'tags:', ...tags.map((t) => `  - ${t}`), '---', '', bodyBox.value.trim(), ''].join('\n');
  fs.writeFileSync(filePath, front, 'utf8');

  setStatus(`[成功] 已保存: ${fileName}，正在生成...`);
  screen.render();

  try {
    execSync(`node "${HEXO_BIN}" generate`, { cwd: BLOG_ROOT, stdio: 'pipe' });
  } catch (e) {
    setStatus('[错误] 生成失败: ' + e.message);
    return;
  }

  if (deploy) {
    setStatus('[生成完成] 正在部署...');
    screen.render();
    try {
      execSync(`node "${HEXO_BIN}" deploy`, { cwd: BLOG_ROOT, stdio: 'inherit' });
      setStatus(`[完成] 文章已发布: ${title} -> https://llwand1.github.io`);
    } catch (e) {
      setStatus('[错误] 部署失败: ' + e.message);
      return;
    }
  } else {
    setStatus(`[完成] 已保存并生成: ${title} (未部署)`);
  }
  screen.render();
}

titleBox.key(['enter'], () => tagsBox.focus());
tagsBox.key(['enter'], () => bodyBox.focus());

bodyBox.key(['C-s'], () => savePost({ deploy: false }));
bodyBox.key(['C-d'], () => savePost({ deploy: true }));
bodyBox.key(['escape'], () => process.exit(0));

titleBox.focus();
screen.render();
