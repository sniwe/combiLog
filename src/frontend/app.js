(function () {
  'use strict';

  const loggerApi = typeof window !== 'undefined' ? window.combiLogLogger : null;
  const browserTransport = loggerApi && typeof loggerApi.createBrowserTransport === 'function'
    ? loggerApi.createBrowserTransport({
        data: {
          endpoint: '/api/logs',
        },
      })
    : null;
  const appLogger = loggerApi && typeof loggerApi.createLogger === 'function'
    ? loggerApi.createLogger({
        data: {
          module: 'frontend/app',
        },
        deps: browserTransport ? { transport: browserTransport } : {},
      })
    : null;

  function getRoot(ctx) {
    const { deps = {} } = ctx;
    return deps.document.getElementById('app');
  }

  async function loadInvs(ctx) {
    const { deps = {} } = ctx;
    const response = await deps.fetch('/api/invs', {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw new Error(`Failed to load invs: ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload.invs) ? payload.invs : [];
  }

  async function loadAudEps(ctx) {
    const { deps = {} } = ctx;
    const response = await deps.fetch('/api/audEps', {
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw new Error(`Failed to load audEps: ${response.status}`);
    }

    const payload = await response.json();
    return Array.isArray(payload.audEps) ? payload.audEps : [];
  }

  async function uploadAudio(ctx) {
    const { data = {}, deps = {} } = ctx;
    const file = data.file;

    if (!file) {
      throw new Error('No audio file selected');
    }

    const response = await deps.fetch('/api/audio-upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Audio-Owner': 'dev001',
        'X-Audio-Name': encodeURIComponent(file.name || 'audio'),
        'X-Audio-Size': String(file.size || 0),
      },
      credentials: 'same-origin',
      body: await file.arrayBuffer(),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload audio: ${response.status}`);
    }

    const payload = await response.json();
    return payload && payload.entry ? payload.entry : null;
  }

  async function createInv(ctx) {
    const { data = {}, deps = {} } = ctx;
    const audEpRef = String(data.audEpRef || '').trim();

    if (!audEpRef) {
      throw new Error('No audEp reference provided');
    }

    const response = await deps.fetch('/api/invs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        ownerId: 'dev001',
        audEpRef,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create inv: ${response.status}`);
    }

    const payload = await response.json();
    return payload && payload.entry ? payload.entry : null;
  }

  function renderEmptyState(ctx) {
    const { deps = {} } = ctx;
    const empty = deps.document.createElement('div');
    empty.className = 'inv-list inv-list--empty';
    return empty;
  }

  function renderAddButton(ctx) {
    const { deps = {} } = ctx;
    const button = deps.document.createElement('button');
    button.className = 'inv-add-btn';
    button.type = 'button';
    button.setAttribute('aria-label', 'Add inv');
    button.textContent = '+';
    return button;
  }

  function openAudioPicker(ctx) {
    const { data = {} } = ctx;
    const fileInput = data.fileInput;

    if (!fileInput) {
      return;
    }

    if (typeof fileInput.showPicker === 'function') {
      fileInput.showPicker();
      return;
    }

    fileInput.click();
  }

  function renderItem(ctx) {
    const { data = {}, deps = {} } = ctx;
    const entry = data.entry || {};
    const audEps = Array.isArray(data.audEps) ? data.audEps : [];
    const audEpRef = Array.isArray(entry.audEpRefs) && entry.audEpRefs.length
      ? entry.audEpRefs[0]
      : typeof entry.audEpRef === 'string'
        ? entry.audEpRef
        : '';
    const linkedAudEp = audEps.find((audEp) => audEp && audEp._id === audEpRef) || null;
    const item = deps.document.createElement('li');
    item.className = 'inv-item';

    const title = deps.document.createElement('div');
    title.className = 'inv-item__title';
    title.textContent = linkedAudEp ? linkedAudEp.name : entry.name || entry._id || 'untitled audEp';
    item.appendChild(title);

    return item;
  }

  function renderList(ctx) {
    const { data = {}, deps = {} } = ctx;
    const invs = Array.isArray(data.invs) ? data.invs : [];
    const audEps = Array.isArray(data.audEps) ? data.audEps : [];

    const list = deps.document.createElement('div');
    list.className = 'inv-list';

    if (!invs.length) {
      return list;
    }

    const items = deps.document.createElement('ul');
    items.className = 'inv-list__items';

    for (const entry of invs) {
      items.appendChild(renderItem({
        data: {
          entry,
          audEps,
        },
        deps,
      }));
    }

    list.appendChild(items);
    return list;
  }

  function renderShell(ctx) {
    const { deps = {} } = ctx;
    const root = getRoot(ctx);
    root.textContent = '';

    const frame = deps.document.createElement('div');
    frame.className = 'inv-shell';
    root.appendChild(frame);

    const addButton = renderAddButton({
      deps,
    });
    frame.appendChild(addButton);

    const fileInput = deps.document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'audio/*';
    fileInput.tabIndex = -1;
    fileInput.setAttribute('aria-hidden', 'true');
    fileInput.style.position = 'absolute';
    fileInput.style.left = '-9999px';
    fileInput.style.width = '1px';
    fileInput.style.height = '1px';
    fileInput.style.opacity = '0';
    frame.appendChild(fileInput);

    addButton.addEventListener('click', () => {
      openAudioPicker({
        data: {
          fileInput,
        },
      });
    });

    return {
      frame,
      addButton,
      fileInput,
    };
  }

  async function initApp(ctx) {
    const { deps = {} } = ctx;
    const logger = appLogger || {
      state() {},
      error() {},
    };
    const shell = renderShell(ctx);

    logger.state({
      phase: 'enter',
      event: 'init',
    });

    try {
      const [audEps, invs] = await Promise.all([
        loadAudEps({ deps }),
        loadInvs({ deps }),
      ]);
      const list = renderList({
        data: {
          audEps,
          invs,
        },
        deps,
      });
      shell.frame.appendChild(list);
      shell.fileInput.addEventListener('change', async () => {
        const file = shell.fileInput.files && shell.fileInput.files[0];
        if (!file) {
          return;
        }

        try {
          const audEp = await uploadAudio({
            data: {
              file,
            },
            deps,
          });
          if (audEp && audEp._id) {
            await createInv({
              data: {
                audEpRef: audEp._id,
              },
              deps,
            });
          }
          const [nextAudEps, nextInvs] = await Promise.all([
            loadAudEps({ deps }),
            loadInvs({ deps }),
          ]);
          const nextList = renderList({
            data: {
              audEps: nextAudEps,
              invs: nextInvs,
            },
            deps,
          });
          shell.frame.querySelector('.inv-list').replaceWith(nextList);
        } catch (error) {
          logger.error({
            phase: 'error',
            event: 'audio-upload',
            data: {
              error,
            },
          });
        } finally {
          shell.fileInput.value = '';
        }
      });
      logger.state({
        phase: 'exit',
        event: 'init',
        data: {
          count: invs.length,
        },
      });
    } catch (error) {
      logger.error({
        phase: 'error',
        event: 'init',
        data: {
          error,
        },
      });
      shell.frame.appendChild(renderEmptyState({
        deps,
      }));
    }
  }

  function bootstrap(ctx) {
    const nativeFetch = ctx && ctx.deps && ctx.deps.fetch ? ctx.deps.fetch : fetch;
    void initApp({
      data: ctx && ctx.data ? ctx.data : {},
      deps: {
        document: ctx && ctx.deps && ctx.deps.document ? ctx.deps.document : document,
        fetch: typeof nativeFetch === 'function' ? nativeFetch.bind(window) : nativeFetch,
      },
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootstrap({
      deps: {
        document,
        fetch,
      },
    }), { once: true });
    return;
  }

  bootstrap({
    deps: {
      document,
      fetch,
    },
  });
})();
