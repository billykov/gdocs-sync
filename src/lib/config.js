import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = '.gdocs-sync.json';
const USER_CONFIG_PATH = path.join(os.homedir(), '.gdocs', 'config.json');

// --- Project-level config (.gdocs-sync.json) ---

export function configExists() {
  return fs.existsSync(path.resolve(process.cwd(), CONFIG_FILE));
}

export function readConfig() {
  const p = path.resolve(process.cwd(), CONFIG_FILE);
  if (!fs.existsSync(p)) {
    console.error(`No ${CONFIG_FILE} found. Run: gdocs init`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    console.error(`Error: ${CONFIG_FILE} is corrupted or invalid JSON.`);
    console.error(`Fix or delete it and run: gdocs init\n`);
    process.exit(1);
  }
}

export function writeConfig(data) {
  const p = path.resolve(process.cwd(), CONFIG_FILE);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

export function getFileEntry(filename) {
  const config = readConfig();
  return config.files?.[filename] ?? null;
}

export function setFileEntry(filename, entry) {
  const config = readConfig();
  config.files = config.files ?? {};
  config.files[filename] = { ...config.files[filename], ...entry };
  writeConfig(config);
}

export function emptyConfig() {
  return { version: 1, files: {} };
}

// --- User-level config (~/.gdocs/config.json) ---

export function readUserConfig() {
  if (!fs.existsSync(USER_CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(USER_CONFIG_PATH, 'utf8'));
}

export function writeUserConfig(data) {
  const dir = path.dirname(USER_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(data, null, 2) + '\n');
}
