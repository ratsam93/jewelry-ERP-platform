// Image-build helper: points the workspace packages (which export TypeScript
// from src/ for local development) at their compiled dist/ output.
// Usage: node rewrite-workspace-pkgs.js <dir containing db, shared-types, utils>
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const toJs = (v) => (typeof v === 'string' ? v.replace(/^\.\/src\/(.*)\.ts$/, './dist/$1.js') : v);
const toDts = (v) => (typeof v === 'string' ? v.replace(/^\.\/src\/(.*)\.ts$/, './dist/$1.d.ts') : v);

for (const p of ['db', 'shared-types', 'utils']) {
  const file = path.join(root, p, 'package.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json.main = toJs(json.main);
  json.types = toDts(json.types);
  if (json.exports) {
    for (const key of Object.keys(json.exports)) json.exports[key] = toJs(json.exports[key]);
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  const main = path.join(root, p, json.main);
  if (!fs.existsSync(main)) throw new Error(`${p}: compiled entry missing: ${main}`);
  console.log(`rewrote ${p} -> ${json.main}`);
}
