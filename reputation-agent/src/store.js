import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const file = process.env.DATA_FILE || path.resolve('data/state.json');
const empty = { campaigns: [], cases: [], orders: [] };

function ensure() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(empty, null, 2));
}

export function readState() {
  ensure();
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeState(state) {
  ensure();
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  return state;
}

export function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
