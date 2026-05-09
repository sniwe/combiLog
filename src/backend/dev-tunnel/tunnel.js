const { spawn } = require('child_process');

const TRYCLOUDFLARE_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i;
const DEFAULT_BINARY = 'cloudflared';

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

function startDevTunnel(ctx) {
  const { data = {}, deps = {} } = ctx;
  const spawnFn = deps.spawn || spawn;
  const onUrl = deps.onUrl || null;
  const onLog = deps.onLog || null;
  const onError = deps.onError || null;
  const onExit = deps.onExit || null;
  const originUrl = resolveOriginUrl({ data });
  const binary = data.binary || DEFAULT_BINARY;
  const args = ['tunnel', '--url', originUrl];
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

  return true;
}

module.exports = {
  extractTunnelUrl,
  resolveOriginUrl,
  startDevTunnel,
  stopDevTunnel,
};
