import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) await walk(full);
    else if (entry.isFile() && (full.endsWith('.mjs') || full.endsWith('.js'))) files.push(full);
  }
}
await walk('.');
await Promise.all(files.map((file) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${file}`)));
})));
console.log(`Lint check passed: ${files.length} JavaScript files parsed.`);
