// Сервер для локальной разработки, без зависимостей.
//
//   npm run dev                                — фронтенд на заглушке API
//   npm run dev -- --api=http://localhost:5273 — запросы к API уходят на бэкенд
//
// Отдаёт файлы из корня репозитория с теми же заголовками безопасности,
// что ожидаются от боевого сервера. С --api проксирует пути бэкенда, чтобы
// фронтенд и API были на одном origin: cookie-сессия и CSP connect-src 'self'
// работают без CORS.

import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 5173;

const apiArg = process.argv.find((arg) => arg.startsWith('--api='));
const apiTarget = apiArg ? new URL(apiArg.slice('--api='.length)) : process.env.API_URL ? new URL(process.env.API_URL) : null;

// Пути, которые обслуживает messenger-backend.
const API_PREFIXES = ['/auth/', '/users/', '/dialogs', '/attachments', '/hubs/', '/health'];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function isApiPath(url) {
  const path = url.split('?')[0];
  return API_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix));
}

function proxy(req, res) {
  const send = apiTarget.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = send(
    {
      protocol: apiTarget.protocol,
      hostname: apiTarget.hostname,
      port: apiTarget.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: apiTarget.host },
      // Локальный бэкенд по https — с самоподписанным сертификатом разработки.
      rejectUnauthorized: false,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/problem+json; charset=utf-8' });
    res.end(JSON.stringify({ status: 502, title: 'Бэкенд недоступен', detail: `Нет ответа от ${apiTarget.origin}` }));
  });
  req.pipe(upstream);
}

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const filePath = normalize(join(root, decoded));
  if (filePath !== root && !filePath.startsWith(root + sep)) return null;

  const info = await stat(filePath).catch(() => null);
  if (!info) return null;
  if (info.isDirectory()) return resolveFile(join(decoded, 'index.html'));
  return filePath;
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';

  // Режим API для фронтенда. На боевом сервере этого адреса нет.
  if (url === '/__dev/config') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ api: apiTarget ? 'real' : 'mock' }));
    return;
  }

  if (isApiPath(url)) {
    if (apiTarget) {
      proxy(req, res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('API disabled: dev server started without --api');
    return;
  }

  try {
    const filePath = await resolveFile(url);
    if (!filePath || filePath.includes(`${sep}.git${sep}`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders });
      res.end('Not found');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': types[extname(filePath)] ?? 'application/octet-stream',
      ...securityHeaders,
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${port} уже занят — скорее всего, dev-сервер уже запущен в другом терминале.`);
    console.error(`Остановите его (Ctrl+C) или запустите на другом порту: $env:PORT=5180; npm run dev`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log(`Dev server: http://localhost:${port}`);
  console.log(apiTarget ? `API: proxy to ${apiTarget.origin}` : 'API: mock (start with --api=URL for the real backend)');
});
