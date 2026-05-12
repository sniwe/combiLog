(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.combiLogLogger = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_STRING_LENGTH = 240;
  const MAX_ARRAY_SAMPLE = 4;
  const MAX_OBJECT_KEYS = 10;
  const MAX_DEPTH = 2;

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function getTypeTag(value) {
    return Object.prototype.toString.call(value).slice(8, -1);
  }

  function createTraceId() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `trace-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
  }

  function truncateString(value) {
    const text = String(value);
    if (text.length <= MAX_STRING_LENGTH) {
      return text;
    }

    return `${text.slice(0, MAX_STRING_LENGTH - 3)}...`;
  }

  function summarizeFunction(value) {
    return {
      type: 'function',
      name: value.name || 'anonymous',
    };
  }

  function summarizeBuffer(value) {
    return {
      type: 'Buffer',
      bytes: value.length,
    };
  }

  function summarizeBinary(value) {
    return {
      type: getTypeTag(value),
      bytes: value.byteLength,
    };
  }

  function summarizeError(value) {
    return {
      type: 'Error',
      name: value.name || 'Error',
      message: truncateString(value.message || ''),
      stack: value.stack ? truncateString(String(value.stack).split('\n').slice(0, 4).join('\n')) : undefined,
    };
  }

  function summarizeRequest(value) {
    return {
      type: 'Request',
      method: value.method,
      url: value.url,
    };
  }

  function summarizeResponse(value) {
    return {
      type: 'Response',
      status: value.status,
      url: value.url,
    };
  }

  function summarizeDomNode(value) {
    const summary = {
      type: value.nodeType === 3 ? 'Text' : 'Element',
    };

    if (value.nodeType === 1) {
      summary.tag = String(value.tagName || '').toLowerCase();
      if (value.id) {
        summary.id = value.id;
      }
      if (value.className && typeof value.className === 'string') {
        summary.className = value.className.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
      }
      const role = typeof value.getAttribute === 'function' ? value.getAttribute('role') : '';
      if (role) {
        summary.role = role;
      }
      const name = typeof value.getAttribute === 'function' ? value.getAttribute('name') : '';
      if (name) {
        summary.name = name;
      }
      const ariaLabel = typeof value.getAttribute === 'function' ? value.getAttribute('aria-label') : '';
      if (ariaLabel) {
        summary.ariaLabel = truncateString(ariaLabel);
      }
    }

    if (typeof value.childElementCount === 'number') {
      summary.children = value.childElementCount;
    }

    return summary;
  }

  function summarizeUi(value, depth, seen) {
    return summarizeValue(value, depth, seen, 'ui');
  }

  function summarizeDeps(value, depth, seen) {
    if (!isObject(value)) {
      return summarizeValue(value, depth, seen, 'deps');
    }

    const summary = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      const item = value[key];
      if (typeof item === 'function') {
        summary[key] = {
          type: 'function',
          name: item.name || key,
        };
        continue;
      }

      if (isObject(item)) {
        const methods = Object.keys(item)
          .filter((prop) => typeof item[prop] === 'function')
          .slice(0, 5);
        summary[key] = {
          type: getTypeTag(item),
          methods,
        };
        continue;
      }

      summary[key] = summarizeValue(item, depth + 1, seen, key);
    }

    if (keys.length > MAX_OBJECT_KEYS) {
      summary.more = keys.length - MAX_OBJECT_KEYS;
    }

    return summary;
  }

  function summarizeArray(value, depth, seen) {
    return {
      type: 'Array',
      length: value.length,
      sample: value.slice(0, MAX_ARRAY_SAMPLE).map((item) => summarizeValue(item, depth + 1, seen)),
    };
  }

  function summarizePlainObject(value, depth, seen) {
    const summary = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      summary[key] = summarizeValue(value[key], depth + 1, seen, key);
    }

    if (keys.length > MAX_OBJECT_KEYS) {
      summary.more = keys.length - MAX_OBJECT_KEYS;
    }

    const ctorName = value.constructor && value.constructor !== Object ? value.constructor.name : '';
    if (ctorName && ctorName !== 'Object') {
      summary.type = ctorName;
    }

    return summary;
  }

  function summarizeValue(value, depth = 0, seen = new WeakSet(), keyHint) {
    if (value === null || value === undefined) {
      return value;
    }

    const valueType = typeof value;
    if (valueType === 'string') {
      return truncateString(value);
    }
    if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
      return value;
    }
    if (valueType === 'symbol') {
      return value.toString();
    }
    if (valueType === 'function') {
      return summarizeFunction(value);
    }

    if (!isObject(value)) {
      return truncateString(String(value));
    }

    if (seen.has(value)) {
      return {
        type: 'Circular',
      };
    }

    if (depth > MAX_DEPTH) {
      return {
        type: getTypeTag(value),
      };
    }

    seen.add(value);

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value)) {
      return summarizeBuffer(value);
    }

    if (value instanceof Error) {
      return summarizeError(value);
    }

    if (typeof File !== 'undefined' && value instanceof File) {
      return {
        type: 'File',
        name: value.name,
        size: value.size,
        mimeType: value.type,
      };
    }

    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return {
        type: 'Blob',
        size: value.size,
        mimeType: value.type,
      };
    }

    if (typeof Request !== 'undefined' && value instanceof Request) {
      return summarizeRequest(value);
    }

    if (typeof Response !== 'undefined' && value instanceof Response) {
      return summarizeResponse(value);
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
      return summarizeBinary(value);
    }

    if (ArrayBuffer.isView && ArrayBuffer.isView(value)) {
      return summarizeBinary(value);
    }

    if (typeof Node !== 'undefined' && value instanceof Node) {
      return summarizeDomNode(value);
    }

    if (Array.isArray(value)) {
      return summarizeArray(value, depth, seen);
    }

    if (keyHint === 'ui') {
      return summarizeUi(value, depth, seen);
    }

    if (keyHint === 'deps') {
      return summarizeDeps(value, depth, seen);
    }

    return summarizePlainObject(value, depth, seen);
  }

  function snapshotCtx(ctx) {
    const input = isObject(ctx) ? ctx : {};
    return {
      data: summarizeValue(input.data, 0, new WeakSet(), 'data'),
      ui: summarizeUi(input.ui, 0, new WeakSet()),
      deps: summarizeDeps(input.deps, 0, new WeakSet()),
    };
  }

  function normalizeLoggerInput(ctx) {
    const input = isObject(ctx) ? ctx : {};
    const data = isObject(input.data) ? input.data : {};
    const ui = isObject(input.ui) ? input.ui : input.ui;
    const deps = isObject(input.deps) ? input.deps : input.deps;
    return {
      ...input,
      data,
      ui,
      deps,
    };
  }

  function getLoggerMeta(ctx) {
    const input = normalizeLoggerInput(ctx);
    const data = input.data || {};
    return {
      module: String(data.module || input.module || 'app'),
      function: data.function || input.function || undefined,
      phase: data.phase || input.phase || undefined,
      event: data.event || input.event || undefined,
      traceId: data.traceId || input.traceId || createTraceId(),
      parentTraceId: data.parentTraceId || input.parentTraceId || undefined,
    };
  }

  function buildEnvelope(level, baseMeta, ctx) {
    const input = normalizeLoggerInput(ctx);
    const data = input.data || {};
    const envelope = {
      timestamp: new Date().toISOString(),
      level,
      module: data.module || input.module || baseMeta.module,
      function: data.function || input.function || baseMeta.function,
      phase: data.phase || input.phase || baseMeta.phase,
      event: data.event || input.event || baseMeta.event,
      traceId: data.traceId || input.traceId || baseMeta.traceId,
      parentTraceId: data.parentTraceId || input.parentTraceId || baseMeta.parentTraceId,
      ctx: snapshotCtx(input),
    };

    if (input.data && Object.prototype.hasOwnProperty.call(input.data, 'message')) {
      envelope.message = truncateString(input.data.message);
    } else if (Object.prototype.hasOwnProperty.call(input, 'message')) {
      envelope.message = truncateString(input.message);
    }

    const error = input.data && input.data.error ? input.data.error : input.error;
    if (error) {
      envelope.error = summarizeValue(error, 0, new WeakSet());
    }

    return envelope;
  }

  function writeEnvelope(envelope, deps, fallbackLevel) {
    const consoleApi = deps && deps.console ? deps.console : console;
    const text = JSON.stringify(envelope);
    if (fallbackLevel === 'error' && consoleApi && typeof consoleApi.error === 'function') {
      consoleApi.error(text);
      return;
    }

    if (consoleApi && typeof consoleApi.log === 'function') {
      consoleApi.log(text);
    }
  }

  function resolveTransport(deps) {
    if (!deps || !deps.transport || typeof deps.transport.send !== 'function') {
      return null;
    }

    return deps.transport;
  }

  function resolveFileTransport(deps) {
    if (!deps || !deps.fileTransport || typeof deps.fileTransport.send !== 'function') {
      return null;
    }

    return deps.fileTransport;
  }

  function createLogger(ctx = {}) {
    const input = normalizeLoggerInput(ctx);
    const baseMeta = getLoggerMeta(input);
    const deps = isObject(input.deps) ? input.deps : {};
    const transport = resolveTransport(deps);
    const fileTransport = resolveFileTransport(deps);

    function emit(level, nextCtx) {
      const envelope = buildEnvelope(level, baseMeta, nextCtx);
      if (transport) {
        transport.send(envelope);
      } else {
        writeEnvelope(envelope, deps, level);
      }

      if (fileTransport) {
        fileTransport.send(envelope);
      }

      return envelope;
    }

    return {
      child(nextCtx = {}) {
        const childInput = normalizeLoggerInput(nextCtx);
        return createLogger({
          data: {
            ...input.data,
            ...childInput.data,
            module: childInput.data.module || childInput.module || baseMeta.module,
            function: childInput.data.function || childInput.function || baseMeta.function,
            phase: childInput.data.phase || childInput.phase || baseMeta.phase,
            event: childInput.data.event || childInput.event || baseMeta.event,
            traceId: childInput.data.traceId || childInput.traceId || baseMeta.traceId,
            parentTraceId: childInput.data.parentTraceId || childInput.parentTraceId || baseMeta.parentTraceId,
          },
          ui: childInput.ui !== undefined ? childInput.ui : input.ui,
          deps: {
            ...deps,
            ...(isObject(childInput.deps) ? childInput.deps : {}),
          },
        });
      },
      event(nextCtx = {}) {
        return emit('info', nextCtx);
      },
      state(nextCtx = {}) {
        const next = isObject(nextCtx) ? nextCtx : {};
        return emit('info', {
          ...next,
          phase: next.phase || 'state',
        });
      },
      error(nextCtx = {}) {
        const next = nextCtx instanceof Error ? { error: nextCtx } : nextCtx;
        return emit('error', next);
      },
      flush() {
        if (transport && typeof transport.flush === 'function') {
          return transport.flush();
        }
        return Promise.resolve();
      },
    };
  }

  function createBrowserTransport(ctx = {}) {
    const input = normalizeLoggerInput(ctx);
    const data = input.data || {};
    const endpoint = String(data.endpoint || '/api/logs');
    const batchSize = Math.max(1, Number(data.batchSize) || 8);
    const flushDelayMs = Math.max(0, Number(data.flushDelayMs) || 25);
    const queue = [];
    let timer = null;
    let inFlight = false;

    async function postBatch(batch) {
      const body = JSON.stringify({ records: batch });
      if (typeof fetch === 'function') {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          keepalive: true,
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error(`Log relay failed: ${response.status}`);
        }

        return;
      }

      if (typeof navigator !== 'undefined' && navigator && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon(endpoint, body);
        if (!ok) {
          throw new Error('Log relay sendBeacon failed');
        }
      }
    }

    function scheduleFlush() {
      if (timer || inFlight || !queue.length) {
        return;
      }

      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, flushDelayMs);
    }

    async function flush() {
      if (inFlight || !queue.length) {
        return;
      }

      inFlight = true;
      const batch = queue.splice(0, batchSize);
      try {
        await postBatch(batch);
      } catch {
        queue.unshift(...batch);
      } finally {
        inFlight = false;
        if (queue.length) {
          scheduleFlush();
        }
      }
    }

    function send(record) {
      queue.push(record);
      if (queue.length >= batchSize) {
        void flush();
        return;
      }

      scheduleFlush();
    }

    if (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
      const onHidden = () => {
        void flush();
      };
      window.addEventListener('pagehide', onHidden);
      window.addEventListener('beforeunload', onHidden);
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            void flush();
          }
        });
      }
    }

    return {
      send,
      flush,
    };
  }

  function logCtx(ctx, logger, meta = {}) {
    const resolvedLogger = logger && typeof logger.state === 'function'
      ? logger
      : createLogger(meta);

    return resolvedLogger.state({
      ...meta,
      event: meta.event || 'ctx',
      phase: meta.phase || 'boundary',
      data: snapshotCtx(ctx),
    });
  }

  return {
    createBrowserTransport,
    createLogger,
    logCtx,
    snapshotCtx,
    summarizeValue,
  };
});
