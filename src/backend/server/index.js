const http = require('http');
const path = require('path');
const fs = require('fs/promises');
const { startDevTunnel } = require('../dev-tunnel');
const { createLogger, logCtx } = require('../../public/logger');

const MIME_BY_EXT = {
  '.aac': 'audio/aac',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

const AUDIO_EXT_BY_MIME = {
  'audio/aac': '.aac',
  'audio/flac': '.flac',
  'audio/m4a': '.m4a',
  'audio/mp3': '.mp3',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-m4a': '.m4a',
  'audio/x-wav': '.wav',
};

const DEFAULT_LOGGER = createLogger({
  data: {
    module: 'backend/server',
  },
});

function getLogger(ctx, functionName) {
  const { deps = {} } = ctx;
  const logger = deps.logger || DEFAULT_LOGGER;
  if (!functionName) {
    return logger;
  }

  return logger.child({
    data: {
      function: functionName,
    },
  });
}

function resolveRoot(ctx) {
  const { data = {} } = ctx;
  return path.resolve(data.root || path.join(__dirname, '..', '..', '..'));
}

function resolveAssets(ctx) {
  const root = resolveRoot(ctx);
  return {
    root,
    backendDir: path.join(root, 'src', 'backend'),
    frontendDir: path.join(root, 'src', 'frontend'),
    publicDir: path.join(root, 'src', 'public'),
    mediaDir: path.join(root, 'src', 'backend', 'media'),
  };
}

function resolveRunLogPath(ctx) {
  return path.join(resolveRoot(ctx), 'mgmt', 'logs', 'current-run.log');
}

async function createRunLogTransport(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const filePath = data.filePath || resolveRunLogPath(ctx);
  await fsApi.mkdir(path.dirname(filePath), { recursive: true });
  await fsApi.writeFile(filePath, '');

  let queue = Promise.resolve();

  function send(record) {
    const line = `${JSON.stringify(record)}\n`;
    queue = queue
      .then(() => fsApi.appendFile(filePath, line))
      .catch(() => fsApi.appendFile(filePath, line).catch(() => undefined));
    return queue;
  }

  return {
    filePath,
    send,
    flush() {
      return queue;
    },
  };
}

function resolveCollections(ctx) {
  const assets = resolveAssets(ctx);
  const collectionsDir = path.join(assets.backendDir, 'collections');
  return {
    collectionsDir,
    audEpsPath: path.join(collectionsDir, 'audEps.json'),
    invsPath: path.join(collectionsDir, 'invs.json'),
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

function parseByteRange(ctx) {
  const { data = {} } = ctx;
  const rangeHeader = String(data.rangeHeader || '').trim();
  const size = Number(data.size) || 0;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
  if (!match || size <= 0) {
    return null;
  }

  const startText = match[1];
  const endText = match[2];
  let start = startText ? Number(startText) : null;
  let end = endText ? Number(endText) : null;

  if (start === null && end === null) {
    return null;
  }

  if (start === null) {
    const suffixLength = Math.max(0, end || 0);
    if (suffixLength <= 0) {
      return null;
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    if (!Number.isFinite(start) || start < 0 || start >= size) {
      return null;
    }
    if (end === null || !Number.isFinite(end) || end >= size) {
      end = size - 1;
    }
    if (end < start) {
      return null;
    }
  }

  return {
    start,
    end,
    size,
  };
}

function getAudioExt(ctx) {
  const { data = {} } = ctx;
  const mimeType = String(data.mimeType || '').toLowerCase();
  return AUDIO_EXT_BY_MIME[mimeType] || '.bin';
}

function parseDataUrl(ctx) {
  const { data = {} } = ctx;
  const text = String(data.dataUrl || '');
  const match = /^data:([^;]+);base64,(.+)$/s.exec(text);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], 'base64'),
  };
}

async function ensureMediaStore(ctx) {
  const { deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const assets = resolveAssets(ctx);
  await fsApi.mkdir(assets.mediaDir, { recursive: true });
  return assets.mediaDir;
}

async function ensureJsonCollection(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const { filePath, defaultValue } = data;

  try {
    await fsApi.access(filePath);
  } catch {
    await fsApi.writeFile(filePath, `${JSON.stringify(defaultValue, null, 2)}\n`);
  }
}

async function ensureCollectionsStore(ctx) {
  const { deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const collections = resolveCollections(ctx);
  const assets = resolveAssets(ctx);
  await fsApi.mkdir(collections.collectionsDir, { recursive: true });
  await fsApi.mkdir(assets.mediaDir, { recursive: true });
  await ensureJsonCollection({
    data: {
      filePath: collections.audEpsPath,
      defaultValue: [],
    },
    deps,
  });
  await ensureJsonCollection({
    data: {
      filePath: collections.invsPath,
      defaultValue: [],
    },
    deps,
  });

  return collections;
}

async function writeJsonFile(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  await fsApi.writeFile(data.filePath, `${JSON.stringify(data.value, null, 2)}\n`);
}

async function readJsonCollection(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const text = await fsApi.readFile(data.filePath, 'utf8');
  return text ? JSON.parse(text) : data.defaultValue;
}

async function normalizeAudEpEntry(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const assets = resolveAssets(ctx);
  const entry = data.entry && typeof data.entry === 'object' ? { ...data.entry } : {};
  const normalized = {
    _id: String(entry._id || '').trim(),
    name: String(entry.name || 'audio'),
    mimeType: String(entry.mimeType || 'application/octet-stream'),
    sizeBytes: Number(entry.sizeBytes) || 0,
    fileName: String(entry.fileName || '').trim(),
    mediaUrl: String(entry.mediaUrl || '').trim(),
  };

  const legacyDataUrl = typeof entry.dataUrl === 'string' ? entry.dataUrl.trim() : '';
  if (!normalized.fileName || !normalized.mediaUrl) {
    if (legacyDataUrl) {
      const parsed = parseDataUrl({ data: { dataUrl: legacyDataUrl } });
      if (parsed) {
        const fileName = `${normalized._id || 'audEp'}${getAudioExt({ data: { mimeType: parsed.mimeType || normalized.mimeType } })}`;
        const filePath = path.join(assets.mediaDir, fileName);
        await fsApi.writeFile(filePath, parsed.bytes);
        normalized.mimeType = parsed.mimeType || normalized.mimeType;
        normalized.sizeBytes = parsed.bytes.length;
        normalized.fileName = fileName;
        normalized.mediaUrl = `/media/${fileName}`;
      }
    } else if (normalized.fileName) {
      normalized.mediaUrl = `/media/${normalized.fileName}`;
    }
  }

  const result = {
    ...entry,
    ...normalized,
  };
  delete result.dataUrl;
  return result;
}

function normalizeInvEntry(ctx) {
  const { data = {} } = ctx;
  const entry = data.entry && typeof data.entry === 'object' ? { ...data.entry } : {};
  const audEpRefs = Array.isArray(entry.audEpRefs)
    ? entry.audEpRefs
    : typeof entry.audEpRef === 'string' && entry.audEpRef.trim()
      ? [entry.audEpRef.trim()]
      : [];
  const lastPlayTs = Number(entry.lastPlayTs);

  return {
    ...entry,
    _id: String(entry._id || '').trim(),
    audEpRefs,
    lastPlayTs: Number.isFinite(lastPlayTs) && lastPlayTs >= 0 ? lastPlayTs : 0,
  };
}

function resolveAudEpMediaPath(ctx, entry) {
  const { data = {} } = ctx;
  const assets = resolveAssets(ctx);
  const fileName = path.basename(
    String(data.fileName || (data.mediaUrl ? String(data.mediaUrl).split('/').pop() : '') || '').trim()
  );

  if (!fileName) {
    return null;
  }

  return path.join(assets.mediaDir, fileName);
}

async function unlinkFileIfExists(ctx) {
  const { data = {}, deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const filePath = String(data.filePath || '').trim();
  if (!filePath) {
    return false;
  }

  try {
    await fsApi.unlink(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function removeInvEntryById(ctx) {
  const { data = {}, deps = {} } = ctx;
  const invId = String(data.invId || '').trim();
  if (!invId) {
    return null;
  }

  const collections = await ensureCollectionsStore(ctx);
  const invs = await readJsonCollection({
    data: {
      filePath: collections.invsPath,
      defaultValue: [],
    },
    deps,
  });
  const normalizedInvs = Array.isArray(invs)
    ? invs.map((entry) => normalizeInvEntry({ data: { entry } }))
    : [];
  const index = normalizedInvs.findIndex((entry) => entry._id === invId);
  if (index < 0) {
    return null;
  }

  const [removed] = normalizedInvs.splice(index, 1);
  await writeJsonFile({
    data: {
      filePath: collections.invsPath,
      value: normalizedInvs,
    },
    deps,
  });

  return removed;
}

async function removeAudEpEntryById(ctx) {
  const { data = {}, deps = {} } = ctx;
  const audEpId = String(data.audEpId || '').trim();
  if (!audEpId) {
    return null;
  }

  const collections = await ensureCollectionsStore(ctx);
  const audEps = await readJsonCollection({
    data: {
      filePath: collections.audEpsPath,
      defaultValue: [],
    },
    deps,
  });
  const normalizedAudEps = Array.isArray(audEps) ? audEps.map((entry) => ({ ...entry })) : [];
  const index = normalizedAudEps.findIndex((entry) => String(entry && entry._id || '').trim() === audEpId);
  if (index < 0) {
    return null;
  }

  const [removed] = normalizedAudEps.splice(index, 1);
  await writeJsonFile({
    data: {
      filePath: collections.audEpsPath,
      value: normalizedAudEps,
    },
    deps,
  });

  const mediaPath = resolveAudEpMediaPath({
    data: {
      root: data.root,
      fileName: removed && removed.fileName,
      mediaUrl: removed && removed.mediaUrl,
    },
  });
  if (mediaPath) {
    await unlinkFileIfExists({
      data: {
        filePath: mediaPath,
      },
      deps,
    });
  }

  const invs = await readJsonCollection({
    data: {
      filePath: collections.invsPath,
      defaultValue: [],
    },
    deps,
  });
  const normalizedInvs = Array.isArray(invs)
    ? invs.map((entry) => normalizeInvEntry({ data: { entry } }))
    : [];
  let invsDirty = false;
  for (const inv of normalizedInvs) {
    const nextRefs = Array.isArray(inv.audEpRefs)
      ? inv.audEpRefs.filter((ref) => String(ref || '').trim() !== audEpId)
      : [];
    if (nextRefs.length !== inv.audEpRefs.length) {
      inv.audEpRefs = nextRefs;
      invsDirty = true;
    }
    if (inv.audEpRef && String(inv.audEpRef).trim() === audEpId) {
      delete inv.audEpRef;
      invsDirty = true;
    }
  }

  if (invsDirty) {
    await writeJsonFile({
      data: {
        filePath: collections.invsPath,
        value: normalizedInvs,
      },
      deps,
    });
  }

  return removed;
}

function readRequestBody(ctx) {
  const { data = {} } = ctx;
  return new Promise((resolve, reject) => {
    const { req } = data;
    const chunks = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}

async function readRequestJson(ctx) {
  const body = await readRequestBody(ctx);
  const text = body.toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function handleBrowserLogs(ctx) {
  const { data = {}, deps = {} } = ctx;
  const log = getLogger(ctx, 'handleBrowserLogs');
  const records = Array.isArray(data.records)
    ? data.records
    : data.record
      ? [data.record]
      : [];

  log.state({
    phase: 'enter',
    event: 'browser-logs',
    data: {
      count: records.length,
    },
  });

  for (const record of records) {
    const level = record && record.level === 'error' ? 'error' : 'log';
    const consoleApi = level === 'error' ? console.error : console.log;
    const rendered = {
      source: 'browser',
      ...record,
    };
    consoleApi(JSON.stringify(rendered));
    if (deps.fileTransport) {
      deps.fileTransport.send(rendered);
    }
  }

  return {
    ok: true,
    count: records.length,
  };
}

async function handleAudioUpload(ctx) {
  const { data = {} } = ctx;
  const log = getLogger(ctx, 'handleAudioUpload');
  const collections = await ensureCollectionsStore(ctx);
  const { deps = {} } = ctx;
  const fsApi = deps.fs || fs;
  const existingText = await fsApi.readFile(collections.audEpsPath, 'utf8');
  const existing = existingText ? JSON.parse(existingText) : [];
  const mediaDir = await ensureMediaStore(ctx);

  log.state({
    phase: 'enter',
    event: 'audio-upload',
    data: {
      ownerId: data.headers && data.headers['x-audio-owner'] ? data.headers['x-audio-owner'] : 'dev001',
      bytes: Buffer.isBuffer(data.bytes) ? data.bytes.length : 0,
    },
  });

  const bytes = Buffer.isBuffer(data.bytes) ? data.bytes : Buffer.from(data.bytes || []);
  const headers = data.headers || {};
  const ownerId = headers['x-audio-owner'] || 'dev001';
  const rawName = headers['x-audio-name'] || 'audio';
  const name = decodeURIComponent(String(rawName));
  const mimeType = data.mimeType || headers['content-type'] || 'application/octet-stream';
  const sizeBytes = Number(headers['x-audio-size']) || bytes.length;
  const audEpOrdinal = String(existing.length + 1).padStart(3, '0');
  const _id = `audEp-${ownerId}-${audEpOrdinal}`;
  const fileName = `${_id}${getAudioExt({ data: { mimeType } })}`;
  const filePath = path.join(mediaDir, fileName);
  await fsApi.writeFile(filePath, bytes);
  const entry = {
    _id,
    name,
    mimeType,
    sizeBytes,
    fileName,
    mediaUrl: `/media/${fileName}`,
  };

  existing.push(entry);
  await writeJsonFile({
    data: {
      filePath: collections.audEpsPath,
      value: existing,
    },
    deps: ctx.deps,
  });

  log.state({
    phase: 'exit',
    event: 'audio-upload-written',
    data: {
      _id: entry._id,
      sizeBytes: entry.sizeBytes,
      collectionSize: existing.length,
    },
  });

  return entry;
}

async function handleInvCreate(ctx) {
  const { data = {} } = ctx;
  const log = getLogger(ctx, 'handleInvCreate');
  const collections = await ensureCollectionsStore(ctx);
  const { deps = {} } = ctx;
  const existing = await readJsonCollection({
    data: {
      filePath: collections.invsPath,
      defaultValue: [],
    },
    deps,
  });
  const normalizedExisting = Array.isArray(existing) ? existing.map((entry) => normalizeInvEntry({ data: { entry } })) : [];

  log.state({
    phase: 'enter',
    event: 'inv-create',
    data: {
      ownerId: String(data.ownerId || 'dev001').trim() || 'dev001',
      invId: String(data.invId || '').trim() || undefined,
      audEpRef: String(data.audEpRef || '').trim() || undefined,
      collectionSize: normalizedExisting.length,
    },
  });

  const ownerId = String(data.ownerId || 'dev001').trim() || 'dev001';
  const audEpRef = String(data.audEpRef || '').trim();
  const invId = String(data.invId || '').trim();
  const hasLastPlayTs = Object.prototype.hasOwnProperty.call(data, 'lastPlayTs');
  const lastPlayTs = hasLastPlayTs ? Math.max(0, Number(data.lastPlayTs) || 0) : undefined;
  const ordinal = String(normalizedExisting.length + 1).padStart(3, '0');
  const existingIndex = invId ? normalizedExisting.findIndex((item) => item._id === invId) : -1;
  const entry = existingIndex >= 0
    ? { ...normalizedExisting[existingIndex] }
    : {
        _id: invId || `inv-${ownerId}-${ordinal}`,
        audEpRefs: [],
        lastPlayTs: 0,
      };

  entry._id = invId || entry._id;
  if (audEpRef) {
    entry.audEpRefs = [audEpRef];
  } else if (Array.isArray(data.audEpRefs)) {
    entry.audEpRefs = data.audEpRefs;
  } else if (!Array.isArray(entry.audEpRefs)) {
    entry.audEpRefs = [];
  }

  if (lastPlayTs !== undefined) {
    entry.lastPlayTs = lastPlayTs;
  } else if (typeof entry.lastPlayTs !== 'number' || Number.isNaN(entry.lastPlayTs)) {
    entry.lastPlayTs = 0;
  }

  if (existingIndex >= 0) {
    normalizedExisting[existingIndex] = entry;
  } else {
    normalizedExisting.push(entry);
  }

  await writeJsonFile({
    data: {
      filePath: collections.invsPath,
      value: normalizedExisting,
    },
    deps: ctx.deps,
  });

  log.state({
    phase: 'exit',
    event: 'inv-create-written',
    data: {
      _id: entry._id,
      audEpRefs: entry.audEpRefs,
      lastPlayTs: entry.lastPlayTs,
      collectionSize: normalizedExisting.length,
    },
  });

  return entry;
}

async function handleRequest(ctx) {
  const { data = {} } = ctx;
  const { req, res } = data;
  const log = getLogger(ctx, 'handleRequest');
  const assets = resolveAssets(ctx);
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  log.state({
    phase: 'enter',
    event: 'request',
    data: {
      method: req.method,
      pathname,
      range: req.headers.range,
      contentType: req.headers['content-type'],
    },
  });

  function respond(statusCode, contentType, body, event, details) {
    sendResponse({
      data: {
        res,
        statusCode,
        contentType,
        body,
      },
    });
    log.state({
      phase: 'exit',
      event,
      data: {
        pathname,
        statusCode,
        ...(details || {}),
      },
    });
  }

  if (req.method === 'POST' && pathname === '/api/logs') {
    try {
      const payload = await readRequestJson({ data: { req } });
      const result = await handleBrowserLogs({
        data: payload,
        deps: ctx.deps,
      });
      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, count: result.count }, null, 2),
        'browser-logs',
        {
          count: result.count,
        }
      );
    } catch (error) {
      respond(
        400,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'browser-logs-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/audEps') {
    try {
      const collections = await ensureCollectionsStore(ctx);
      const audEps = await readJsonCollection({
        data: {
          filePath: collections.audEpsPath,
          defaultValue: [],
        },
        deps: ctx.deps,
      });
      log.state({
        phase: 'read',
        event: 'audEps',
        data: {
          count: Array.isArray(audEps) ? audEps.length : 0,
        },
      });
      const normalizedAudEps = [];
      let dirty = false;
      for (const entry of Array.isArray(audEps) ? audEps : []) {
        const normalized = await normalizeAudEpEntry({
          data: { entry },
          deps: ctx.deps,
        });
        if (JSON.stringify(normalized) !== JSON.stringify(entry)) {
          dirty = true;
        }
        normalizedAudEps.push(normalized);
      }

      if (dirty) {
        await writeJsonFile({
          data: {
            filePath: collections.audEpsPath,
            value: normalizedAudEps,
          },
          deps: ctx.deps,
        });
        log.state({
          phase: 'write',
          event: 'audEps',
          data: {
            count: normalizedAudEps.length,
          },
        });
      }

      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, audEps: normalizedAudEps }, null, 2),
        'audEps',
        {
          count: normalizedAudEps.length,
        }
      );
    } catch (error) {
      respond(
        500,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'audEps-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/invs') {
    try {
      const collections = await ensureCollectionsStore(ctx);
      const invs = await readJsonCollection({
        data: {
          filePath: collections.invsPath,
          defaultValue: [],
        },
        deps: ctx.deps,
      });
      const normalizedInvs = Array.isArray(invs)
        ? invs.map((entry) => normalizeInvEntry({ data: { entry } }))
        : [];
      log.state({
        phase: 'read',
        event: 'invs',
        data: {
          count: normalizedInvs.length,
        },
      });
      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({
          ok: true,
          invs: normalizedInvs,
        }, null, 2),
        'invs',
        {
          count: normalizedInvs.length,
        }
      );
    } catch (error) {
      respond(
        500,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'invs-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/invs') {
    try {
      const payload = await readRequestJson({ data: { req } });
      const entry = await handleInvCreate({
        data: payload,
        deps: ctx.deps,
      });
      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, entry }, null, 2),
        'invs-write',
        {
          _id: entry._id,
        }
      );
    } catch (error) {
      respond(
        400,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'invs-write-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/invs/')) {
    try {
      const invId = decodeURIComponent(pathname.slice('/api/invs/'.length));
      const entry = await removeInvEntryById({
        data: {
          invId,
        },
        deps: ctx.deps,
      });
      if (!entry) {
        respond(
          404,
          'application/json; charset=utf-8',
          JSON.stringify({ ok: false, error: 'Inv not found' }, null, 2),
          'invs-delete-miss',
          {
            invId,
          }
        );
        return;
      }

      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, entry }, null, 2),
        'invs-delete',
        {
          _id: entry._id,
        }
      );
    } catch (error) {
      respond(
        500,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'invs-delete-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/audEps/')) {
    try {
      const audEpId = decodeURIComponent(pathname.slice('/api/audEps/'.length));
      const entry = await removeAudEpEntryById({
        data: {
          audEpId,
        },
        deps: ctx.deps,
      });
      if (!entry) {
        respond(
          404,
          'application/json; charset=utf-8',
          JSON.stringify({ ok: false, error: 'Audio entry not found' }, null, 2),
          'audEps-delete-miss',
          {
            audEpId,
          }
        );
        return;
      }

      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, entry }, null, 2),
        'audEps-delete',
        {
          _id: entry._id,
        }
      );
    } catch (error) {
      respond(
        500,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'audEps-delete-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/audio-upload') {
    try {
      const bytes = await readRequestBody({ data: { req } });
      const entry = await handleAudioUpload({
        data: {
          bytes,
          headers: req.headers,
          mimeType: req.headers['content-type'],
        },
        deps: ctx.deps,
      });
      respond(
        200,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: true, entry }, null, 2),
        'audio-upload',
        {
          _id: entry._id,
        }
      );
    } catch (error) {
      respond(
        400,
        'application/json; charset=utf-8',
        JSON.stringify({ ok: false, error: error.message }, null, 2),
        'audio-upload-error',
        {
          error: error.message,
        }
      );
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/media/')) {
    try {
      const assets = resolveAssets(ctx);
      const mediaName = path.basename(pathname.slice('/media/'.length));
      const filePath = path.join(assets.mediaDir, mediaName);
      const { deps = {} } = ctx;
      const fsApi = deps.fs || fs;
      const stat = await fsApi.stat(filePath);
      const contentType = getContentType({
        data: {
          filePath,
        },
      });
      const range = parseByteRange({
        data: {
          rangeHeader: req.headers.range,
          size: stat.size,
        },
      });

      if (range) {
        const fileHandle = await fsApi.open(filePath, 'r');
        try {
          const body = Buffer.alloc(range.end - range.start + 1);
          await fileHandle.read(body, 0, body.length, range.start);
          res.statusCode = 206;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Length', String(body.length));
          res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${range.size}`);
          res.setHeader('Accept-Ranges', 'bytes');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
          log.state({
            phase: 'exit',
            event: 'media',
            data: {
              pathname,
              filePath,
              statusCode: 206,
              range: {
                start: range.start,
                end: range.end,
              },
            },
          });
        } finally {
          await fileHandle.close();
        }
        return;
      }

      const body = await readFile({
        data: {
          filePath,
        },
        deps: ctx.deps,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(body.length));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
      log.state({
        phase: 'exit',
        event: 'media',
        data: {
          pathname,
          filePath,
          statusCode: 200,
        },
      });
    } catch (error) {
      log.error({
        phase: 'error',
        event: 'media',
        data: {
          pathname,
          error,
        },
      });
      respond(
        404,
        'text/plain; charset=utf-8',
        'Not found',
        'media-not-found',
        {
          pathname,
        }
      );
    }
    return;
  }

  const routes = {
    '/': path.join(assets.publicDir, 'index.html'),
    '/index.html': path.join(assets.publicDir, 'index.html'),
    '/logger.js': path.join(assets.publicDir, 'logger.js'),
    '/app.js': path.join(assets.frontendDir, 'app.js'),
    '/style.css': path.join(assets.frontendDir, 'style.css'),
  };

  const filePath = routes[pathname];
  if (!filePath) {
    respond(
      404,
      'text/plain; charset=utf-8',
      'Not found',
      'route-not-found',
      {
        pathname,
      }
    );
    return;
  }

  try {
    const body = await readFile({
      data: { filePath },
      deps: ctx.deps,
    });
    respond(
      200,
      getContentType({ data: { filePath } }),
      body,
      'file',
      {
        pathname,
        filePath,
      }
    );
  } catch (error) {
    respond(
      500,
      'text/plain; charset=utf-8',
      error.message,
      'file-error',
      {
        pathname,
        filePath,
        error: error.message,
      }
    );
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
  const log = getLogger(ctx, 'listen');

  log.state({
    phase: 'enter',
    event: 'listen',
    data: {
      host,
      port,
    },
  });

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
  log.state({
    phase: 'exit',
    event: 'listen',
    data: {
      host,
      port: actualPort,
    },
  });
  return `http://${host}:${actualPort}`;
}

async function startServer(ctx) {
  const { data = {}, deps = {} } = ctx;
  const log = getLogger(ctx, 'startServer');
  await ensureCollectionsStore({ deps });
  const server = createServer({
    data,
    deps,
  });
  log.state({
    phase: 'start',
    event: 'server',
    data: {
      host: data.host || '127.0.0.1',
      port: data.port || 3000,
    },
  });
  const localUrl = await listen({
    data: {
      server,
      host: data.host,
      port: data.port,
    },
    deps,
  });
  const tunnel = await startDevTunnel({
    data: {
      localUrl,
      cwd: resolveRoot({ data }),
      binary: data.cloudflaredBinary,
      protocol: data.cloudflaredProtocol,
    },
    deps: {
      spawn: deps.spawn,
      logger: log.child({
        data: {
          function: 'startDevTunnel',
        },
      }),
      onUrl(ctx2) {
        const { data: data2 = {} } = ctx2;
        log.state({
          phase: 'discover',
          event: 'tunnel-url',
          data: {
            url: data2.url,
            originUrl: data2.originUrl,
          },
        });
      },
      onError(ctx2) {
        const { data: data2 = {} } = ctx2;
        log.error({
          phase: 'error',
          event: 'tunnel-error',
          data: {
            error: data2.error,
            originUrl: data2.originUrl,
          },
        });
      },
    },
  });
  log.state({
    phase: 'ready',
    event: 'server',
    data: {
      localUrl,
    },
  });

  return {
    localUrl,
    server,
    tunnel,
    stop: async () => {
      log.state({
        phase: 'stop',
        event: 'server',
        data: {
          localUrl,
        },
      });
      if (tunnel) {
        tunnel.stop();
      }
      await new Promise((resolve) => server.close(resolve));
      log.state({
        phase: 'stopped',
        event: 'server',
        data: {
          localUrl,
        },
      });
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
  let log = DEFAULT_LOGGER;

  try {
    const config = {
      ...parseArgs({
        data: { argv: data.argv || process.argv.slice(2) },
      }),
      ...data,
    };
    const fileTransport = await createRunLogTransport({
      data: {
        filePath: resolveRunLogPath({ data: config }),
      },
      deps,
    });
    const runtimeDeps = {
      ...deps,
      fileTransport,
    };
    log = createLogger({
      data: {
        module: 'backend/server',
      },
      deps: runtimeDeps,
    }).child({
      data: {
        function: 'main',
      },
    });
    logCtx({
      data: config,
      deps: {
        logger: log,
      },
    }, log, {
      function: 'main',
      phase: 'bootstrap',
      event: 'config',
    });
    const runtime = await startServer({
      data: config,
      deps: {
        ...runtimeDeps,
        logger: log,
      },
    });

    log.state({
      phase: 'ready',
      event: 'local-url',
      data: {
        localUrl: runtime.localUrl,
      },
    });

    return runtime;
  } catch (error) {
    log.error({
      function: 'main',
      event: 'fatal',
      data: {
        error,
      },
    });
    throw error;
  }
}

if (require.main === module) {
  main({
    data: {
      argv: process.argv.slice(2),
    },
    deps: {
      logger: DEFAULT_LOGGER,
    },
  }).catch((error) => {
    process.exitCode = 1;
  });
}

module.exports = {
  createServer,
  ensureCollectionsStore,
  handleAudioUpload,
  handleInvCreate,
  handleRequest,
  main,
  parseArgs,
  resolveAssets,
  resolveCollections,
  resolveRoot,
  removeAudEpEntryById,
  removeInvEntryById,
  startServer,
};
