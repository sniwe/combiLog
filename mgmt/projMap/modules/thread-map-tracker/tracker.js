const { createDelta, normalizeState } = require('./delta');

async function loadState(ctx) {
  const { data = {}, deps } = ctx;
  const state = await deps.readJson({
    data: {
      path: data.path,
    },
  });
  return normalizeState({
    data: state,
  });
}

async function saveDelta(ctx) {
  const { data = {}, deps } = ctx;
  const state = normalizeState({
    data: data.state,
  });
  state.deltas.push(createDelta({
    data: data.delta,
  }));
  state.updated = new Date().toISOString();
  await deps.writeJson({
    data: {
      path: data.path,
      value: state,
    },
  });
  return state;
}

module.exports = {
  loadState,
  saveDelta,
};
