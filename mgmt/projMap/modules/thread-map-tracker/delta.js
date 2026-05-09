function createDelta(ctx) {
  const { data = {} } = ctx;
  return {
    kind: data.kind || 'map-update',
    at: data.at || new Date().toISOString(),
    mapPath: data.mapPath || null,
    note: data.note || '',
  };
}

function normalizeState(ctx) {
  const { data = {} } = ctx;
  return {
    updated: data.updated || new Date().toISOString(),
    deltas: Array.isArray(data.deltas) ? data.deltas : [],
  };
}

module.exports = {
  createDelta,
  normalizeState,
};
