#!/usr/bin/env node
/**
 * 本地开发服务器 + DeepSeek 代理（零依赖，仅用 Node 内置模块）
 * ---------------------------------------------------------------------------
 * 作用：
 *   1) 静态服务整个仓库根目录（这样 index.html 里的 ../vendor/... 才能访问到）。
 *   2) 代理 POST /__deepseek/*  →  https://api.deepseek.com/*
 *      浏览器直连 LLM API 常被 CORS 拦截；改由服务器转发（服务器之间无 CORS），
 *      前端会自动优先走这个代理，离线时回退直连。
 *
 * 用法：
 *   node ascend-950-workbench-demo/dev-server.js          # 默认 http://localhost:8000
 *   PORT=9000 node ascend-950-workbench-demo/dev-server.js
 *   然后打开 http://localhost:8000/ascend-950-workbench-demo/index.html
 *
 * 安全：API Key 只在请求头里透传给 DeepSeek，本脚本不打印、不落盘、不缓存。
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // 仓库根目录
const PORT = Number(process.env.PORT) || 8000;
const UPSTREAM_HOST = 'api.deepseek.com';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

// ── DeepSeek 代理 ──────────────────────────────────────────────────────────
function proxyDeepSeek(req, res) {
  const upstreamPath = req.url.replace(/^\/__deepseek/, '') || '/';
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const options = {
      host: UPSTREAM_HOST,
      port: 443,
      path: upstreamPath,
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Authorization': req.headers['authorization'] || '',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const up = https.request(options, (upRes) => {
      res.writeHead(upRes.statusCode || 502, {
        'Content-Type': upRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      upRes.pipe(res);
    });
    up.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'proxy_upstream_error', message: String(err.message || err) }));
    });
    up.write(body);
    up.end();
  });
}

// ── 静态文件 ────────────────────────────────────────────────────────────────
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const filePath = path.join(ROOT, urlPath);
  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/__deepseek')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      res.end();
      return;
    }
    if (req.method === 'POST') return proxyDeepSeek(req, res);
    res.writeHead(405); res.end('Method Not Allowed'); return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  本地服务已启动：http://localhost:${PORT}`);
  console.log(`  打开页面：     http://localhost:${PORT}/ascend-950-workbench-demo/index.html`);
  console.log(`  DeepSeek 代理： POST /__deepseek/*  →  https://${UPSTREAM_HOST}/*`);
  console.log(`  (Ctrl+C 停止)\n`);
});
