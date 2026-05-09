const fs = require('fs/promises');

async function readJson(ctx) {
  const { data = {} } = ctx;
  const text = await fs.readFile(data.path, 'utf8');
  return JSON.parse(text);
}

async function writeJson(ctx) {
  const { data = {} } = ctx;
  const text = JSON.stringify(data.value, null, 2);
  await fs.writeFile(data.path, `${text}\n`, 'utf8');
  return data.path;
}

async function ensureDir(ctx) {
  const { data = {} } = ctx;
  await fs.mkdir(data.path, { recursive: true });
  return data.path;
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
};
