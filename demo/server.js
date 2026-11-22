const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const routes = [
  ['/demo/', path.join(root, 'demo')],
  ['/build/', path.join(root, '.onframe', 'demo')],
  ['/extension/ui/options/', path.join(root, 'extension', 'ui', 'options')],
  ['/extension/core/', path.join(root, 'extension', 'core')],
  ['/extension/modules/photos/', path.join(root, 'extension', 'modules', 'photos')],
  ['/extension/modules/commerce/', path.join(root, 'extension', 'modules', 'commerce')],
  ['/fonts/', path.join(root, 'extension', 'fonts')],
  ['/vendor/phosphor/', path.join(root, 'extension', 'vendor', 'phosphor')]
];
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
};

function routeFile(pathname) {
  for (const [prefix, directory] of routes) {
    if (!pathname.startsWith(prefix)) continue;
    const file = path.resolve(directory, pathname.slice(prefix.length));
    if (file === directory || !file.startsWith(directory + path.sep)) return null;
    return file;
  }
  return null;
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.writeHead(302, { Location: '/demo/options.html#products' });
    response.end();
    return;
  }
  const file = routeFile(pathname);
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }
  fs.stat(file, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; connect-src 'none'; img-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src 'none'"
    });
    fs.createReadStream(file).pipe(response);
  });
});

function listen(port) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < 4190) return listen(port + 1);
    console.error(error);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Demonstração: http://127.0.0.1:${port}/demo/options.html#products`);
    console.log(`Anúncio: http://127.0.0.1:${port}/demo/marketplace.html`);
  });
}

listen(Number(process.env.DEMO_PORT) || 4177);
