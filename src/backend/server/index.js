const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { startDevTunnel } = require('../dev-tunnel');

const MIME_BY_EXT = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveRoot(ctx) {
  const { data = {} } = ctx;
  return path.resolve(data.root || path.join(__dirname, '..', '..', '..'));
}

function resolveAssets(ctx) {
  const root = resolveRoot(ctx);
  return {
    root,
    frontendDir: path.join(root, 'src', 'frontend'),
    publicDir: path.join(root, 'src', 'public'),
  };
}

function getContentType(ctx) {
  const { data = {} } = ctx;
  return MIME_BY_EXT[path.extname(data.filePath || '')] || 'application/octet-stream';
}

function sendResponse(ctx) {
  const { data = {} } = ctx;
  const { res, statusCode, contentType, body } = data;
  res.statusCode = statusCode;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

async function readFile(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  return fsApi.readFile(data.filePath);
}

async function handleRequest(ctx) {
  const { data = {} } = ctx;
  const { req, res } = data;
  const assets = resolveAssets(ctx);
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  const routes = {
    '/': path.join(assets.publicDir, 'index.html'),
    '/index.html': path.join(assets.publicDir, 'index.html'),
    '/app.js': path.join(assets.frontendDir, 'app.js'),
    '/style.css': path.join(assets.frontendDir, 'style.css'),
  };

  const filePath = routes[pathname];
  if (!filePath) {
    sendResponse({
      data: {
        res,
        statusCode: 404,
        contentType: 'text/plain; charset=utf-8',
        body: 'Not found',
      },
    });
    return;
  }

  try {
    const body = await readFile({
      data: { filePath },
      deps: ctx.deps,
    });
    sendResponse({
      data: {
        res,
        statusCode: 200,
        contentType: getContentType({ data: { filePath } }),
        body,
      },
    });
  } catch (error) {
    sendResponse({
      data: {
        res,
        statusCode: 500,
        contentType: 'text/plain; charset=utf-8',
        body: error.message,
      },
    });
  }
}

function createServer(ctx) {
  return http.createServer((req, res) => {
    void handleRequest({
      data: { req, res },
      deps: ctx.deps,
    });
  });
}

async function listen(ctx) {
  const { data = {} } = ctx;
  const { server } = data;
  const host = data.host || '127.0.0.1';
  const port = data.port || 3000;

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : port;
  return `http://${host}:${actualPort}`;
}

async function startServer(ctx) {
  const { data = {}, deps = {} } = ctx;
  const server = createServer({
    data,
    deps,
  });
  const localUrl = await listen({
    data: {
      server,
      host: data.host,
      port: data.port,
    },
  });
  const tunnel = startDevTunnel({
    data: {
      localUrl,
      cwd: resolveRoot({ data }),
      binary: data.cloudflaredBinary,
    },
    deps: {
      spawn: deps.spawn,
      onUrl(ctx2) {
        const { data: data2 = {} } = ctx2;
        const log = deps.log || console.log.bind(console);
        log(`Tunnel URL: ${data2.url}`);
      },
      onLog(ctx2) {
        const { data: data2 = {} } = ctx2;
        const log = deps.log || console.log.bind(console);
        if (data2.line) {
          log(data2.line);
        }
      },
      onError(ctx2) {
        const { data: data2 = {} } = ctx2;
        const log = deps.error || console.error.bind(console);
        log(data2.error);
      },
      onExit(ctx2) {
        const { data: data2 = {} } = ctx2;
        const log = deps.log || console.log.bind(console);
        log(`Tunnel exited with code ${data2.code}`);
      },
    },
  });

  return {
    localUrl,
    server,
    tunnel,
    stop: async () => {
      if (tunnel) {
        tunnel.stop();
      }
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function parseArgs(ctx) {
  const { data = {} } = ctx;
  const argv = Array.isArray(data.argv) ? data.argv : [];
  const result = {
    host: '127.0.0.1',
    port: 3000,
  };

  for (const arg of argv) {
    if (arg.startsWith('--host=')) {
      result.host = arg.slice('--host='.length) || result.host;
      continue;
    }

    if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed)) {
        result.port = parsed;
      }
      continue;
    }

    if (arg.startsWith('--cloudflared=')) {
      result.cloudflaredBinary = arg.slice('--cloudflared='.length);
    }
  }

  return result;
}

async function main(ctx) {
  const { data = {}, deps = {} } = ctx;
  const config = {
    ...parseArgs({
      data: { argv: data.argv || process.argv.slice(2) },
    }),
    ...data,
  };
  const runtime = await startServer({
    data: config,
    deps,
  });

  const log = deps.log || console.log.bind(console);
  log(`Local URL: ${runtime.localUrl}`);
  if (runtime.tunnel && typeof runtime.tunnel.getUrl === 'function') {
    const tunnelUrl = runtime.tunnel.getUrl();
    if (tunnelUrl) {
      log(`Tunnel URL: ${tunnelUrl}`);
    }
  }

  return runtime;
}

if (require.main === module) {
  main({
    data: {
      argv: process.argv.slice(2),
    },
    deps: {
      log: console.log.bind(console),
      error: console.error.bind(console),
    },
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  handleRequest,
  main,
  parseArgs,
  resolveAssets,
  resolveRoot,
  startServer,
};
