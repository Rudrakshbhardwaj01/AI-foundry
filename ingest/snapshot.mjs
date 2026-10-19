import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCHEMA_VERSION = 1;

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION || typeof snapshot.snapshotId !== 'string') return false;
  if (!Array.isArray(snapshot.articles) || typeof snapshot.lastSuccessfulRefreshAt !== 'string') return false;
  return snapshot.articles.every((article) => article && typeof article.id === 'string' && typeof article.title === 'string' && typeof article.url === 'string' && /^https?:\/\//.test(article.url));
}

export async function readSnapshot(outputDir) {
  try {
    const value = JSON.parse(await readFile(path.join(outputDir, 'published.json'), 'utf8'));
    return validateSnapshot(value) ? value : null;
  } catch {
    return null;
  }
}

export async function readSourceStatus(outputDir) {
  try { return JSON.parse(await readFile(path.join(outputDir, 'source-status.json'), 'utf8')); } catch { return {}; }
}

async function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

/** Publish one complete, validated snapshot and retain the previous one. */
export async function publishSnapshot({ outputDir, snapshot, runStatus, sourceStatuses }) {
  if (!validateSnapshot(snapshot)) throw new Error('Refusing to publish an invalid snapshot');
  await mkdir(outputDir, { recursive: true });
  const publishedPath = path.join(outputDir, 'published.json');
  const previousPath = path.join(outputDir, 'previous.json');
  const candidate = `${JSON.stringify(snapshot, null, 2)}\n`;
  const previousStatus = await stat(publishedPath).then(() => true).catch(() => false);
  if (previousStatus) {
    const previousTemporary = `${previousPath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await copyFile(publishedPath, previousTemporary);
      await rename(previousTemporary, previousPath);
    } finally {
      await rm(previousTemporary, { force: true }).catch(() => {});
    }
  }
  await atomicWrite(publishedPath, candidate);
  await atomicWrite(path.join(outputDir, 'run-status.json'), `${JSON.stringify(runStatus, null, 2)}\n`);
  await atomicWrite(path.join(outputDir, 'source-status.json'), `${JSON.stringify(sourceStatuses, null, 2)}\n`);
  return { publishedPath, previousPath: previousStatus ? previousPath : null };
}

export { atomicWrite, SCHEMA_VERSION };
