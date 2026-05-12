const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { createLogger } = require('../../public/logger');

const TRYCLOUDFLARE_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i;
const DEFAULT_BINARY = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
const ALT_BINARY = 'C:\\Program Files\\cloudflared\\cloudflared.exe';

const DEFAULT_LOGGER = createLogger({
  data: {
    module: 'backend/dev-tunnel',
  },
});

function resolveOriginUrl(ctx) {
  const { data = {} } = ctx;
  if (data.localUrl) {
    return data.localUrl;
  }

  const scheme = data.scheme || 'http';
  const host = data.host || '127.0.0.1';
  const port = data.port || 3000;

  return `${scheme}://${host}:${port}`;
}

function extractTunnelUrl(ctx) {
  const { data = {} } = ctx;
  const text = String(data.text || '');
  const match = text.match(TRYCLOUDFLARE_URL_RE);
  return match ? match[0] : null;
}

async function pathExists(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  try {
    await fsApi.access(data.path);
    return true;
  } catch {
    return false;
  }
}

async function resolveBinaryPath(ctx) {
  const { data = {}, deps = {} } = ctx;
  const candidates = [];
  if (data.binary) {
    candidates.push(data.binary);
  }
  candidates.push(
    DEFAULT_BINARY,
    ALT_BINARY,
    'cloudflared'
  );

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (path.isAbsolute(candidate)) {
      if (await pathExists({
        data: { path: candidate },
        deps,
      })) {
        return candidate;
      }
      continue;
    }

    return candidate;
  }

  throw new Error('cloudflared not found. Install Cloudflare cloudflared or pass binary path.');
}

async function startDevTunnel(ctx) {
  const { data = {}, deps = {} } = ctx;
  const spawnFn = deps.spawn || spawn;
  const onUrl = deps.onUrl || null;
  const onLog = deps.onLog || null;
  const onError = deps.onError || null;
  const onExit = deps.onExit || null;
  const log = deps.logger || DEFAULT_LOGGER;
  const originUrl = resolveOriginUrl({ data });
  const binary = await resolveBinaryPath({
    data: {
      binary: data.binary,
    },
    deps,
  });

  log.state({
    phase: 'start',
    event: 'spawn',
    data: {
      originUrl,
      binary,
      protocol: data.protocol || 'http2',
    },
  });

  const protocol = data.protocol || 'http2';
  const args = ['tunnel', '--no-autoupdate', '--protocol', protocol, '--url', originUrl];
  const child = spawnFn(binary, args, {
    cwd: data.cwd || deps.cwd || '.',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let tunnelUrl = null;
  let stdoutBuffer = '';
  let stderrBuffer = '';

  function flushBuffer(ctx2) {
    const { data: data2 = {} } = ctx2;
    const bufferKey = data2.bufferKey;
    const chunkText = String(data2.chunkText || '');
    const nextBuffer = `${data2.buffer || ''}${chunkText}`;
    const lines = nextBuffer.split(/\r?\n/);
    const remainder = lines.pop() || '';

    for (const line of lines) {
      log.event({
        phase: 'stream',
        event: `tunnel.${bufferKey}`,
        data: {
          originUrl,
          line,
        },
      });
      if (onLog) {
        onLog({
          data: {
            stream: bufferKey,
            line,
            originUrl,
          },
          deps,
        });
      }

      const extracted = extractTunnelUrl({
        data: {
          text: line,
        },
      });

      if (extracted && !tunnelUrl) {
        tunnelUrl = extracted;
        log.state({
          phase: 'discover',
          event: 'tunnel-url',
          data: {
            originUrl,
            url: tunnelUrl,
          },
        });
        if (onUrl) {
          onUrl({
            data: {
              url: tunnelUrl,
              originUrl,
            },
            deps,
          });
        }
      }
    }

    return remainder;
  }

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdoutBuffer = flushBuffer({
        data: {
          bufferKey: 'stdout',
          buffer: stdoutBuffer,
          chunkText: chunk.toString('utf8'),
        },
      });
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderrBuffer = flushBuffer({
        data: {
          bufferKey: 'stderr',
          buffer: stderrBuffer,
          chunkText: chunk.toString('utf8'),
        },
      });
    });
  }

  child.on('error', (error) => {
    log.error({
      phase: 'error',
      event: 'spawn-error',
      data: {
        originUrl,
        error,
      },
    });
    if (onError) {
      onError({
        data: {
          error,
          originUrl,
        },
        deps,
      });
    }
  });

  child.on('exit', (code, signal) => {
    log.state({
      phase: 'exit',
      event: 'tunnel-exit',
      data: {
        originUrl,
        code,
        signal,
        tunnelUrl,
      },
    });
    if (onExit) {
      onExit({
        data: {
          code,
          signal,
          originUrl,
          tunnelUrl,
        },
        deps,
      });
    }
  });

  return {
    child,
    originUrl,
    stop() {
      log.state({
        phase: 'stop',
        event: 'tunnel-stop',
        data: {
          originUrl,
          tunnelUrl,
        },
      });
      if (!child.killed) {
        child.kill();
      }
    },
    getUrl() {
      return tunnelUrl;
    },
  };
}

function stopDevTunnel(ctx) {
  const { data = {} } = ctx;
  const child = data.child;

  if (!child) {
    return false;
  }

  if (!child.killed) {
    child.kill();
  }

  const log = ctx.deps && ctx.deps.logger ? ctx.deps.logger : DEFAULT_LOGGER;
  log.state({
    phase: 'stop',
    event: 'tunnel-stop',
    data: {
      killed: true,
    },
  });

  return true;
}

module.exports = {
  extractTunnelUrl,
  resolveOriginUrl,
  startDevTunnel,
  stopDevTunnel,
  resolveBinaryPath,
};
