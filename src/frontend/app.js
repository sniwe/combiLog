(function () {
  const loggerApi = window.combiLogLogger || null;
  const browserTransport = loggerApi
    ? loggerApi.createBrowserTransport({
        data: {
          endpoint: '/api/logs',
          batchSize: 8,
          flushDelayMs: 25,
        },
      })
    : null;
  const appLogger = loggerApi
    ? loggerApi.createLogger({
        data: {
          module: 'frontend/app',
        },
        deps: {
          transport: browserTransport,
        },
      })
    : null;
  const state = {
    audEps: [],
    invs: [],
    searchCollapsed: false,
    targetedInvIndex: null,
    activeAudEpId: null,
    activeInvId: null,
  };

  const stage = document.getElementById('stage');
  const box = document.getElementById('box');
  const invButton = document.getElementById('inv-button');
  const audioButton = document.getElementById('audio-button');
  const audioPlayer = document.createElement('audio');
  audioPlayer.preload = 'auto';
  audioPlayer.hidden = true;
  document.body.appendChild(audioPlayer);

  if (appLogger) {
    appLogger.state({
      function: 'bootstrap',
      phase: 'start',
      event: 'load',
      data: {
        stage: 'frontend',
      },
    });
  }

  window.addEventListener('error', (event) => {
    reportError('window', 'runtime-error', event.error || new Error(event.message || 'window error'), {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError('window', 'unhandledrejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
      reason: event.reason,
    });
  });

  function stripExtension(name) {
    return String(name || '').replace(/\.[^.]+$/, '') || 'audio';
  }

  function trace(event, details) {
    if (!appLogger) {
      if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(`[combiLog] ${event}`, details);
      }
      return;
    }

    appLogger.event({
      function: 'trace',
      phase: 'event',
      event,
      data: details,
    });
  }

  function reportError(functionName, event, error, details) {
    if (!appLogger) {
      if (typeof console !== 'undefined' && typeof console.error === 'function') {
        console.error(error);
      }
      return;
    }

    appLogger.error({
      function: functionName,
      phase: 'error',
      event,
      data: {
        ...(details || {}),
        error,
      },
    });
  }

  function logBoundary(functionName, phase, event, data) {
    if (!appLogger) {
      return;
    }

    appLogger.state({
      function: functionName,
      phase,
      event,
      data,
    });
  }

  function clearElement(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  async function fetchJson(path, options) {
    const response = await fetch(path, options);
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body && body.error ? body.error : `Request failed: ${response.status}`);
    }
    return body;
  }

  function getLinkedAudEp(inv) {
    const audEpRef = Array.isArray(inv.audEpRefs)
      ? inv.audEpRefs[0]
      : typeof inv.audEpRef === 'string'
        ? inv.audEpRef
        : null;
    return state.audEps.find((audEp) => audEp._id === audEpRef) || null;
  }

  function getAudEpPlaybackSrc(audEp) {
    if (!audEp) {
      return '';
    }

    return String(audEp.mediaUrl || audEp.dataUrl || '').trim();
  }

  function normalizeAudioSrc(src) {
    const value = String(src || '').trim();
    if (!value) {
      return '';
    }

    try {
      return new URL(value, window.location.href).href;
    } catch (error) {
      return value;
    }
  }

  function formatPlaybackTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const wholeSeconds = Math.floor(safeSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
  }

  function getRenderedInvs() {
    return state.invs.length
      ? state.invs
      : [
          {
            _id: 'inv-dev001-001',
            audEpRefs: [],
            lastPlayTs: 0,
          },
        ];
  }

  function getTargetableInvCount() {
    return getRenderedInvs().length;
  }

  function getTargetedInv() {
    if (state.targetedInvIndex === null) {
      return null;
    }

    return getRenderedInvs()[state.targetedInvIndex] || null;
  }

  function getInvPlaybackTs(inv) {
    const playbackTs = Number(inv && inv.lastPlayTs);
    return Number.isFinite(playbackTs) && playbackTs > 0 ? playbackTs : 0;
  }

  function setInvPlaybackTs(invId, playbackTs) {
    const normalizedTs = Math.max(0, Number(playbackTs) || 0);
    const inv = state.invs.find((item) => item._id === invId);
    if (inv) {
      inv.lastPlayTs = normalizedTs;
    }
    return normalizedTs;
  }

  async function persistInvPlaybackTs(invId, playbackTs) {
    logBoundary('persistInvPlaybackTs', 'start', 'persist', {
      invId,
      playbackTs,
    });
    trace('persistInvPlaybackTs:request', { invId, playbackTs });
    await fetchJson('/api/invs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invId,
        lastPlayTs: Math.max(0, Number(playbackTs) || 0),
        ownerId: 'dev001',
      }),
    });
  }

  async function persistActivePlaybackTs() {
    logBoundary('persistActivePlaybackTs', 'start', 'persist-active', {
      activeInvId: state.activeInvId,
    });
    if (!state.activeInvId) {
      trace('persistActivePlaybackTs:skip', { reason: 'no-active-inv' });
      return;
    }

    const inv = state.invs.find((item) => item._id === state.activeInvId);
    if (!inv) {
      trace('persistActivePlaybackTs:skip', { reason: 'missing-inv', activeInvId: state.activeInvId });
      return;
    }

    const playbackTs = setInvPlaybackTs(inv._id, audioPlayer.currentTime);
    trace('persistActivePlaybackTs:commit', {
      invId: inv._id,
      playbackTs,
      currentTime: audioPlayer.currentTime,
      paused: audioPlayer.paused,
    });
    await persistInvPlaybackTs(inv._id, playbackTs);
  }

  async function startInvPlayback(inv, audEp, playbackTsOverride) {
    logBoundary('startInvPlayback', 'start', 'playback-start', {
      invId: inv && inv._id,
      audEpId: audEp && audEp._id,
      playbackTsOverride,
    });
    const playbackTs = Number.isFinite(playbackTsOverride)
      ? Math.max(0, playbackTsOverride)
      : getInvPlaybackTs(inv);
    const playbackSrc = getAudEpPlaybackSrc(audEp);
    const normalizedPlaybackSrc = normalizeAudioSrc(playbackSrc);
    const currentPlaybackSrc = normalizeAudioSrc(audioPlayer.currentSrc || audioPlayer.src);

    trace('startInvPlayback:begin', {
      invId: inv && inv._id,
      audEpId: audEp && audEp._id,
      playbackTs,
      currentTime: audioPlayer.currentTime,
      currentSrc: currentPlaybackSrc,
      targetSrc: normalizedPlaybackSrc,
      paused: audioPlayer.paused,
      readyState: audioPlayer.readyState,
    });
    state.activeInvId = inv._id;
    state.activeAudEpId = audEp._id;

    if (normalizedPlaybackSrc && normalizedPlaybackSrc !== currentPlaybackSrc) {
      trace('startInvPlayback:src-change', {
        from: currentPlaybackSrc,
        to: normalizedPlaybackSrc,
      });
      audioPlayer.src = playbackSrc;
      await new Promise((resolve) => {
        audioPlayer.addEventListener(
          'loadedmetadata',
          () => {
            trace('startInvPlayback:loadedmetadata', {
              duration: audioPlayer.duration,
              readyState: audioPlayer.readyState,
            });
            resolve();
          },
          { once: true }
        );
      });
    } else {
      trace('startInvPlayback:src-reuse', {
        src: currentPlaybackSrc,
      });
    }

    await seekAudioPlayerToTs(playbackTs);
    await audioPlayer.play();
    trace('startInvPlayback:play-called', {
      currentTime: audioPlayer.currentTime,
      paused: audioPlayer.paused,
    });
    logBoundary('startInvPlayback', 'done', 'playback-start', {
      invId: inv && inv._id,
      audEpId: audEp && audEp._id,
      currentTime: audioPlayer.currentTime,
    });
  }

  async function syncAudioPlayerToInv(inv) {
    logBoundary('syncAudioPlayerToInv', 'start', 'sync', {
      invId: inv && inv._id,
    });
    const linkedAudEp = getLinkedAudEp(inv);
    if (!linkedAudEp) {
      trace('syncAudioPlayerToInv:skip', { invId: inv && inv._id, reason: 'unlinked' });
      return;
    }

    if (state.activeInvId && state.activeInvId !== inv._id && !audioPlayer.paused) {
      trace('syncAudioPlayerToInv:skip', {
        invId: inv._id,
        activeInvId: state.activeInvId,
        reason: 'active-playback-other-inv',
      });
      return;
    }

    const playbackTs = getInvPlaybackTs(inv);
    const playbackSrc = getAudEpPlaybackSrc(linkedAudEp);
    if (!playbackSrc) {
      trace('syncAudioPlayerToInv:skip', { invId: inv._id, reason: 'missing-src' });
      return;
    }

    const normalizedPlaybackSrc = normalizeAudioSrc(playbackSrc);
    const currentPlaybackSrc = normalizeAudioSrc(audioPlayer.currentSrc || audioPlayer.src);
    trace('syncAudioPlayerToInv:begin', {
      invId: inv._id,
      audEpId: linkedAudEp._id,
      playbackTs,
      currentSrc: currentPlaybackSrc,
      targetSrc: normalizedPlaybackSrc,
      paused: audioPlayer.paused,
      readyState: audioPlayer.readyState,
    });

    if (normalizedPlaybackSrc && normalizedPlaybackSrc !== currentPlaybackSrc) {
      trace('syncAudioPlayerToInv:src-change', {
        from: currentPlaybackSrc,
        to: normalizedPlaybackSrc,
      });
      audioPlayer.src = playbackSrc;
      await new Promise((resolve) => {
        audioPlayer.addEventListener(
          'loadedmetadata',
          () => {
            trace('syncAudioPlayerToInv:loadedmetadata', {
              duration: audioPlayer.duration,
              readyState: audioPlayer.readyState,
            });
            resolve();
          },
          { once: true }
        );
      });
    } else {
      trace('syncAudioPlayerToInv:src-reuse', {
        src: currentPlaybackSrc,
      });
    }

    await seekAudioPlayerToTs(playbackTs);
    logBoundary('syncAudioPlayerToInv', 'done', 'sync', {
      invId: inv._id,
      audEpId: linkedAudEp._id,
      playbackTs,
    });
  }

  async function seekAudioPlayerToTs(playbackTs) {
    logBoundary('seekAudioPlayerToTs', 'start', 'seek', {
      playbackTs,
    });
    const targetTs = Number.isFinite(playbackTs) && playbackTs > 0 ? playbackTs : 0;
    const boundedTs = audioPlayer.duration && targetTs >= audioPlayer.duration ? 0 : targetTs;
    trace('seekAudioPlayerToTs:request', {
      targetTs,
      boundedTs,
      currentTime: audioPlayer.currentTime,
      duration: audioPlayer.duration,
      seeking: audioPlayer.seeking,
    });
    if (Math.abs(audioPlayer.currentTime - boundedTs) < 0.01 && !audioPlayer.seeking) {
      trace('seekAudioPlayerToTs:skip', { reason: 'already-at-position' });
      return;
    }

    await new Promise((resolve) => {
      const handleSeeked = () => {
        trace('seekAudioPlayerToTs:seeked', {
          currentTime: audioPlayer.currentTime,
          duration: audioPlayer.duration,
        });
        resolve();
      };

      audioPlayer.addEventListener('seeked', handleSeeked, { once: true });
      audioPlayer.currentTime = boundedTs;
      trace('seekAudioPlayerToTs:set-currentTime', {
        boundedTs,
        postSetCurrentTime: audioPlayer.currentTime,
        seeking: audioPlayer.seeking,
      });
      if (!audioPlayer.seeking) {
        queueMicrotask(() => {
          if (!audioPlayer.seeking) {
            trace('seekAudioPlayerToTs:microtask-resolve', {
              currentTime: audioPlayer.currentTime,
            });
            resolve();
          }
        });
      }
    });
    logBoundary('seekAudioPlayerToTs', 'done', 'seek', {
      boundedTs,
      currentTime: audioPlayer.currentTime,
    });
  }

  function updatePlaybackIndicator() {
    render();
  }

  function syncActivePlaybackTime() {
    if (!state.activeInvId || audioPlayer.paused) {
      render();
      return;
    }

    const inv = state.invs.find((item) => item._id === state.activeInvId);
    if (inv) {
      inv.lastPlayTs = audioPlayer.currentTime;
    }
    render();
  }

  function handlePlaybackEnded() {
    if (!state.activeInvId) {
      render();
      return;
    }

    const inv = state.invs.find((item) => item._id === state.activeInvId);
    if (inv) {
      const playbackTs = setInvPlaybackTs(inv._id, audioPlayer.currentTime);
      persistInvPlaybackTs(inv._id, playbackTs).catch((error) => {
        reportError('handlePlaybackEnded', 'persistInvPlaybackTs:error', error);
      });
    }

    state.activeInvId = null;
    state.activeAudEpId = null;
    render();
  }

  function handlePlaybackPaused() {
    logBoundary('handlePlaybackPaused', 'state', 'pause', {
      activeInvId: state.activeInvId,
      activeAudEpId: state.activeAudEpId,
    });
    trace('audio:event:pause', {
      activeInvId: state.activeInvId,
      activeAudEpId: state.activeAudEpId,
      currentTime: audioPlayer.currentTime,
      paused: audioPlayer.paused,
    });
    if (!state.activeInvId) {
      render();
      return;
    }

    persistActivePlaybackTs().catch((error) => {
      reportError('handlePlaybackPaused', 'persistActivePlaybackTs:error', error);
    });
    render();
  }

  audioPlayer.addEventListener('timeupdate', syncActivePlaybackTime);
  audioPlayer.addEventListener('play', updatePlaybackIndicator);
  audioPlayer.addEventListener('pause', handlePlaybackPaused);
  audioPlayer.addEventListener('ended', handlePlaybackEnded);

  function openAudioPicker(onPicked) {
    logBoundary('openAudioPicker', 'start', 'pick', {});
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener(
      'change',
      async () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) {
          return;
        }

        try {
          const entry = await uploadAudio(file);
          state.audEps.push(entry);
          state.searchCollapsed = true;
          render();
          await onPicked();
        } catch (error) {
          reportError('openAudioPicker', 'uploadAudio:error', error);
        }
      },
      { once: true }
    );
    input.click();
  }

  function createSearchInput(inv, index) {
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = index === 0 ? 'searchInput' : '';
    searchInput.className = 'inv-search';
    searchInput.placeholder = 'Search audio';
    searchInput.value = '';
    searchInput.addEventListener('input', () => {
      applySearchFilter(searchInput);
    });
    return searchInput;
  }

  function applySearchFilter(searchInput) {
    const query = String(searchInput.value || '').trim().toLowerCase();
    const item = searchInput.closest('.inv-item');
    if (!item) {
      return;
    }

    const tags = item.querySelector('.inv-tags');
    if (!tags) {
      return;
    }

    for (const button of tags.querySelectorAll('.audEp-tag')) {
      if (button.classList.contains('audEp-tag--plus') || button.classList.contains('audEp-tag--selected')) {
        button.hidden = false;
        continue;
      }

      const label = String(button.dataset.audEpName || '').toLowerCase();
      button.hidden = query ? !label.includes(query) : false;
    }
  }

  function renderInvTags(inv, index) {
    const tags = document.createElement('div');
    tags.className = 'inv-tags';
    if (index === 0) {
      tags.id = 'audEpTags';
    }

    const linkedAudEp = getLinkedAudEp(inv);
    if (linkedAudEp) {
      tags.classList.add('inv-tags--linked');
      const selected = document.createElement('button');
      selected.type = 'button';
      selected.className = 'audEp-tag audEp-tag--selected';
      selected.dataset.audEpName = linkedAudEp.name;
      selected.textContent = stripExtension(linkedAudEp.name);
      selected.disabled = true;
      tags.appendChild(selected);
    } else {
      if (!state.searchCollapsed) {
        const searchInput = createSearchInput(inv, index);
        tags.appendChild(searchInput);
      }

      for (const audEp of state.audEps) {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'audEp-tag';
        tag.dataset.audEpName = audEp.name;
        tag.textContent = stripExtension(audEp.name);
        tag.addEventListener('click', async () => {
          await linkAudioToInv(inv._id, audEp._id);
        });
        tags.appendChild(tag);
      }

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'audEp-tag audEp-tag--plus';
      plus.textContent = '+';
      plus.addEventListener('click', () => {
        openAudioPicker(loadState);
      });
      tags.appendChild(plus);
    }

    const playInd = document.createElement('span');
    playInd.className = 'aud-play-ind';
    if ((state.targetedInvIndex === null && index === 0) || state.targetedInvIndex === index) {
      playInd.id = 'audPlayInd';
    }
    if (linkedAudEp) {
      playInd.hidden = false;
      const isActive = state.activeInvId === inv._id && state.activeAudEpId === linkedAudEp._id;
      const playbackTs = isActive && !audioPlayer.paused ? audioPlayer.currentTime : getInvPlaybackTs(inv);
      playInd.dataset.state = isActive && !audioPlayer.paused ? 'playing' : 'idle';
      playInd.textContent = formatPlaybackTime(playbackTs);
    } else {
      playInd.hidden = true;
    }
    tags.appendChild(playInd);

    return tags;
  }

  function renderInvItem(inv, index) {
    const item = document.createElement('article');
    item.className = 'inv-item';
    if (state.targetedInvIndex === index) {
      item.classList.add('inv-item--targeted');
    } else if (state.targetedInvIndex === null) {
      item.classList.add('inv-item--idle-targeting');
    }
    item.dataset.invId = inv._id;
    item.appendChild(renderInvTags(inv, index));
    return item;
  }

  function renderInvs() {
    const invsRoot = document.createElement('div');
    invsRoot.id = 'invs';
    const invs = getRenderedInvs();

    for (const [index, inv] of invs.entries()) {
      invsRoot.appendChild(renderInvItem(inv, index));
    }

    return invsRoot;
  }

  function render() {
    clearElement(box);
    box.appendChild(renderInvs());
  }

  async function freezeActivePlayback() {
    logBoundary('freezeActivePlayback', 'start', 'freeze', {
      activeInvId: state.activeInvId,
    });
    if (!state.activeInvId) {
      return;
    }

    const inv = state.invs.find((item) => item._id === state.activeInvId);
    if (!inv) {
      state.activeInvId = null;
      state.activeAudEpId = null;
      return;
    }

    const playbackTs = setInvPlaybackTs(inv._id, audioPlayer.currentTime);
    state.activeInvId = null;
    state.activeAudEpId = null;
    audioPlayer.pause();
    audioPlayer.currentTime = playbackTs;
    render();

    try {
      await persistInvPlaybackTs(inv._id, playbackTs);
    } catch (error) {
      reportError('freezeActivePlayback', 'persistInvPlaybackTs:error', error);
    }
  }

  function setTargetedInvIndex(nextIndex) {
    logBoundary('setTargetedInvIndex', 'start', 'target', {
      nextIndex,
      targetedInvIndex: state.targetedInvIndex,
    });
    const count = getTargetableInvCount();
    if (!count) {
      state.targetedInvIndex = null;
      trace('target:set', { nextIndex, count, targetedInvIndex: state.targetedInvIndex });
      render();
      return;
    }

    const normalized = ((nextIndex % count) + count) % count;
    const previous = state.targetedInvIndex;
    state.targetedInvIndex = normalized;
    trace('target:set', {
      previous,
      nextIndex,
      normalized,
      targetedInvId: getTargetedInv() && getTargetedInv()._id,
      activeInvId: state.activeInvId,
    });
    syncAudioPlayerToInv(getTargetedInv()).catch((error) => {
      trace('syncAudioPlayerToInv:error', {
        message: error && error.message ? error.message : String(error),
      });
      reportError('setTargetedInvIndex', 'syncAudioPlayerToInv:error', error);
    });
    render();
  }

  function handleKeydown(event) {
    logBoundary('handleKeydown', 'start', 'keydown', {
      key: event.key,
      code: event.code,
    });
    const tagName = String(event.target && event.target.tagName ? event.target.tagName : '').toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || event.target.isContentEditable) {
      return;
    }

    trace('keydown', {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      targetedInvId: getTargetedInv() && getTargetedInv()._id,
      activeInvId: state.activeInvId,
      activeAudEpId: state.activeAudEpId,
      paused: audioPlayer.paused,
      currentTime: audioPlayer.currentTime,
    });

    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      const targetedInv = getTargetedInv();
      if (!targetedInv) {
        trace('space:skip', { reason: 'no-targeted-inv' });
        return;
      }

      const linkedAudEp = getLinkedAudEp(targetedInv);
      if (!linkedAudEp) {
        trace('space:skip', { reason: 'no-linked-audEp', targetedInvId: targetedInv._id });
        return;
      }

      if (state.activeInvId === targetedInv._id && !audioPlayer.paused) {
        trace('space:toggle-pause', {
          targetedInvId: targetedInv._id,
          currentTime: audioPlayer.currentTime,
        });
        freezeActivePlayback().catch((error) => {
          trace('freezeActivePlayback:error', {
            message: error && error.message ? error.message : String(error),
          });
          reportError('handleKeydown', 'freezeActivePlayback:error', error);
        });
        return;
      }

      const resumeTs = getInvPlaybackTs(targetedInv);
      trace('space:play', {
        targetedInvId: targetedInv._id,
        audEpId: linkedAudEp._id,
        resumeTs,
        activeInvId: state.activeInvId,
        paused: audioPlayer.paused,
      });
      startInvPlayback(targetedInv, linkedAudEp, resumeTs).catch((error) => {
        trace('startInvPlayback:error', {
          message: error && error.message ? error.message : String(error),
        });
        reportError('handleKeydown', 'startInvPlayback:error', error);
      });
      return;
    }

    if (!event.ctrlKey) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      trace('target:arrow-down', {
        activeInvId: state.activeInvId,
        targetedInvIndex: state.targetedInvIndex,
      });
      persistActivePlaybackTs().catch((error) => {
        trace('persistActivePlaybackTs:error', {
          message: error && error.message ? error.message : String(error),
        });
        reportError('handleKeydown', 'persistActivePlaybackTs:error', error);
      });
      if (state.targetedInvIndex === null) {
        setTargetedInvIndex(0);
        return;
      }

      setTargetedInvIndex(state.targetedInvIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      trace('target:arrow-up', {
        activeInvId: state.activeInvId,
        targetedInvIndex: state.targetedInvIndex,
      });
      persistActivePlaybackTs().catch((error) => {
        trace('persistActivePlaybackTs:error', {
          message: error && error.message ? error.message : String(error),
        });
        reportError('handleKeydown', 'persistActivePlaybackTs:error', error);
      });
      if (state.targetedInvIndex === null) {
        setTargetedInvIndex(getTargetableInvCount() - 1);
        return;
      }

      setTargetedInvIndex(state.targetedInvIndex - 1);
    }
  }

  async function loadState() {
    logBoundary('loadState', 'start', 'load', {});
    trace('loadState:begin');
    const [audEpsResult, invsResult] = await Promise.all([
      fetchJson('/api/audEps'),
      fetchJson('/api/invs'),
    ]);

    state.audEps = Array.isArray(audEpsResult.audEps) ? audEpsResult.audEps : [];
    state.invs = Array.isArray(invsResult.invs) ? invsResult.invs : [];
    trace('loadState:done', {
      audEpsCount: state.audEps.length,
      invsCount: state.invs.length,
      targetedInvIndex: state.targetedInvIndex,
      targetedInvId: getTargetedInv() && getTargetedInv()._id,
    });
    if (state.targetedInvIndex !== null && state.targetedInvIndex >= getTargetableInvCount()) {
      state.targetedInvIndex = getTargetableInvCount() ? getTargetableInvCount() - 1 : null;
      trace('loadState:retarget', {
        targetedInvIndex: state.targetedInvIndex,
        targetedInvId: getTargetedInv() && getTargetedInv()._id,
      });
    }
    logBoundary('loadState', 'done', 'load', {
      audEpsCount: state.audEps.length,
      invsCount: state.invs.length,
      targetedInvIndex: state.targetedInvIndex,
    });
    render();
  }

  async function linkAudioToInv(invId, audEpRef) {
    logBoundary('linkAudioToInv', 'start', 'link', {
      invId,
      audEpRef,
    });
    await fetchJson('/api/invs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invId,
        audEpRef,
        ownerId: 'dev001',
      }),
    });
    logBoundary('linkAudioToInv', 'done', 'link', {
      invId,
      audEpRef,
    });
    await loadState();
  }

  async function createInv() {
    logBoundary('createInv', 'start', 'create', {});
    await fetchJson('/api/invs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ownerId: 'dev001',
      }),
    });
    logBoundary('createInv', 'done', 'create', {});
    await loadState();
  }

  async function uploadAudio(file) {
    logBoundary('uploadAudio', 'start', 'upload', {
      name: file && file.name,
      size: file && file.size,
      type: file && file.type,
    });
    const bytes = await file.arrayBuffer();
    const response = await fetch('/api/audio-upload', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Audio-Name': encodeURIComponent(file.name),
        'X-Audio-Size': String(file.size),
        'X-Audio-Owner': 'dev001',
      },
      body: bytes,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${response.status} ${text}`);
    }

    const body = await response.json();
    logBoundary('uploadAudio', 'done', 'upload', {
      entryId: body && body.entry && body.entry._id,
    });
    return body.entry;
  }

  if (!stage || !box || !audioButton || !invButton) {
    return;
  }

  invButton.addEventListener('click', () => {
    createInv().catch((error) => {
      reportError('bootstrap', 'createInv:error', error);
    });
  });

  document.addEventListener('keydown', handleKeydown);

  audioButton.hidden = true;

  loadState().catch((error) => {
    reportError('bootstrap', 'loadState:error', error);
    render();
  });
})();
