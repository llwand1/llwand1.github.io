#!/usr/bin/env node
const express = require('express');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BLOG_ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(BLOG_ROOT, 'source', '_posts');
const HEXO_BIN = path.join(BLOG_ROOT, 'node_modules', 'hexo-cli', 'bin', 'hexo');
const PORT = 5050;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function slugify(title) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const p = path.join(POSTS_DIR, f);
      const raw = fs.readFileSync(p, 'utf8');
      const m = raw.match(/^title:\s*(.+)$/m);
      return { file: f, title: m ? m[1].trim() : f, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

app.get('/api/posts', (req, res) => {
  res.json(listPosts());
});

app.get('/api/post/:file', (req, res) => {
  const p = path.join(POSTS_DIR, req.params.file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  const raw = fs.readFileSync(p, 'utf8');
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  let title = '', tags = [], body = raw;
  if (fm) {
    const meta = fm[1];
    const tm = meta.match(/title:\s*(.+)/);
    if (tm) title = tm[1].trim();
    const tagLines = meta.match(/tags:\s*\n([\s\S]*?)(?:\n\w|$)/);
    if (tagLines) {
      tags = tagLines[1]
        .split('\n')
        .map((t) => t.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
    }
    body = fm[2];
  }
  res.json({ title, tags, body });
});

app.post('/api/save', (req, res) => {
  const { title, tags, body, file } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
  try {
    let filePath;
    if (file && fs.existsSync(path.join(POSTS_DIR, file))) {
      filePath = path.join(POSTS_DIR, file);
    } else {
      execSync(`node "${HEXO_BIN}" new "${title.trim()}"`, { cwd: BLOG_ROOT, stdio: 'pipe' });
      const slug = slugify(title);
      const candidates = fs
        .readdirSync(POSTS_DIR)
        .filter((f) => f.endsWith('.md'))
        .sort((a, b) => fs.statSync(path.join(POSTS_DIR, b)).mtimeMs - fs.statSync(path.join(POSTS_DIR, a)).mtimeMs);
      const target = candidates[0];
      filePath = path.join(POSTS_DIR, slug + '.md');
      if (target && target !== slug + '.md') {
        fs.renameSync(path.join(POSTS_DIR, target), filePath);
      }
    }
    const tagArr = Array.isArray(tags) ? tags : String(tags || '').split(',').map((t) => t.trim()).filter(Boolean);
    const front = [
      '---',
      `title: ${title.trim()}`,
      `date: ${new Date().toISOString()}`,
      'tags:',
      ...tagArr.map((t) => `  - ${t}`),
      '---',
      '',
      (body || '').trim(),
      '',
    ].join('\n');
    fs.writeFileSync(filePath, front, 'utf8');
    res.json({ ok: true, file: path.basename(filePath) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/generate', (req, res) => {
  try {
    execSync(`node "${HEXO_BIN}" generate`, { cwd: BLOG_ROOT, stdio: 'pipe' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/deploy', (req, res) => {
  try {
    execSync(`node "${HEXO_BIN}" deploy`, { cwd: BLOG_ROOT, stdio: 'pipe' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`博客编辑器已启动: ${url}`);
  const { exec } = require('child_process');
  const opener = process.platform === 'win32' ? 'cmd /c start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} ${url}`);
});
