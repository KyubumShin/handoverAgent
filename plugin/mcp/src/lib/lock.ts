import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;

export class FileLock {
  private lockPath: string;

  constructor(baseDir: string) {
    this.lockPath = join(baseDir, '.lock');
  }

  async acquire(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < LOCK_TIMEOUT_MS) {
      if (!existsSync(this.lockPath)) {
        try {
          writeFileSync(this.lockPath, JSON.stringify({ pid: process.pid, time: Date.now() }), { flag: 'wx' });
          return;
        } catch {
          // Another process grabbed it
        }
      } else {
        // Check for stale lock
        try {
          const lockData = JSON.parse(readFileSync(this.lockPath, 'utf-8'));
          if (Date.now() - lockData.time > LOCK_TIMEOUT_MS) {
            unlinkSync(this.lockPath);
            continue;
          }
        } catch {
          // Corrupt lock file, remove it
          try { unlinkSync(this.lockPath); } catch {}
          continue;
        }
      }
      await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_MS));
    }
    throw new Error('Failed to acquire file lock: timeout');
  }

  release(): void {
    try {
      if (existsSync(this.lockPath)) {
        unlinkSync(this.lockPath);
      }
    } catch {
      // Ignore release errors
    }
  }
}
