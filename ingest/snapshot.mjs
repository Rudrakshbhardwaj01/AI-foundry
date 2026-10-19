import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, content, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

/** Publish only a complete candidate and retain the last published snapshot. */
export async function publishSnapshot({ outputDir, snapshot, runStatus, sourceStatuses }) {
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

export { atomicWrite };
