const path = require('path');
const fs = require('fs/promises');
const { readJson, writeJson, saveDelta } = require('../modules/thread-map-tracker');

async function main(ctx) {
  const { data = {}, deps } = ctx;
  const projectRoot = data.projectRoot || process.cwd();
  const mapPath = data.mapPath || path.join(projectRoot, 'mgmt', 'projMap', 'map.json');
  const deltaPath = data.deltaPath || path.join(projectRoot, 'mgmt', 'projMap', 'state', 'thread-map-deltas.json');

  const map = await readJson({
    data: { path: mapPath },
    deps: { fs },
  });
  const state = await saveDelta({
    data: {
      path: deltaPath,
      state: { updated: new Date().toISOString(), deltas: [] },
      delta: {
        kind: 'map-update',
        mapPath,
        note: map.id || 'map',
      },
    },
    deps: {
      writeJson,
    },
  });

  if (deps && typeof deps.log === 'function') {
    deps.log({ map, state });
  }

  return { map, state };
}

if (require.main === module) {
  main({
    data: {},
    deps: {},
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
