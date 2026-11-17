// Local path-routing reverse proxy mimicking the hosted demo domain:
//   /api/*, /health  -> API    (default http://localhost:4000)
//   /admin*          -> admin  (default http://localhost:3000)
//   everything else  -> storefront (default http://localhost:3003)
// Started automatically by playwright.config.ts (webServer). Listens on E2E_PROXY_PORT (default 8089).
const http = require('http');
const net = require('net');
const { URL } = require('url');

const targets = {
  api: new URL(process.env.E2E_API_URL || 'http://localhost:4000'),
  admin: new URL(process.env.E2E_ADMIN_URL || 'http://localhost:3000'),
  store: new URL(process.env.E2E_STORE_URL || 'http://localhost:3003'),
};
const port = Number(process.env.E2E_PROXY_PORT || 3001);

function pick(url) {
  if (url === '/health' || url.startsWith('/health?') || url.startsWith('/api/') || url === '/api') return targets.api;
  if (url === '/admin' || url.startsWith('/admin/') || url.startsWith('/admin?')) return targets.admin;
  return targets.store;
}

const server = http.createServer((req, res) => {
  const t = pick(req.url);
  const preq = http.request(
    { hostname: t.hostname === 'localhost' ? '127.0.0.1' : t.hostname, port: t.port, path: req.url, method: req.method, headers: { ...req.headers, host: t.host } },
    (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    },
  );
  preq.on('error', (e) => {
    res.writeHead(502);
    res.end('proxy error: ' + e.message);
  });
  req.pipe(preq);
});
server.on('upgrade', (req, socket, head) => {
  const t = pick(req.url);
  const s = net.connect(Number(t.port), t.hostname === 'localhost' ? '127.0.0.1' : t.hostname, () => {
    s.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries({ ...req.headers, host: t.host }).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    s.write(head);
    s.pipe(socket);
    socket.pipe(s);
  });
  s.on('error', () => socket.destroy());
});
server.listen(port, () => console.log('e2e proxy on ' + port));
