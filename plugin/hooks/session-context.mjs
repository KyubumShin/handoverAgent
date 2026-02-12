#!/usr/bin/env node

/**
 * SessionStart hook: If .handover/ exists, inject a brief context summary
 * so Claude knows the handover plugin is active.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const cwd = process.cwd();
  const handoverDir = join(cwd, '.handover');

  if (!existsSync(handoverDir)) {
    process.exit(0);
  }

  // Try to read profile
  const profilePath = join(handoverDir, 'profile.json');
  let profileInfo = '';
  if (existsSync(profilePath)) {
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    profileInfo = `"${profile.name}" (${profile.type} handover)`;
  }

  // Try to count entries
  const entriesDir = join(handoverDir, 'knowledge', 'entries');
  let entryCount = 0;
  if (existsSync(entriesDir)) {
    const { readdirSync } = await import('node:fs');
    entryCount = readdirSync(entriesDir).filter(f => f.endsWith('.json')).length;
  }

  // Try to read index for categories
  const indexPath = join(handoverDir, 'knowledge', 'index.json');
  let categories = 0;
  if (existsSync(indexPath)) {
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    const cats = new Set(index.entries?.map(e => e.category) || []);
    categories = cats.size;
  }

  if (entryCount > 0) {
    const msg = [
      `Handover plugin active: ${profileInfo || 'initialized'}`,
      `Knowledge base: ${entryCount} entries across ${categories} categories`,
      'Use /handover:ask to query, /handover:gaps to find missing topics.',
    ].join(' | ');

    process.stdout.write(msg);
  }
} catch {
  // Silent failure
  process.exit(0);
}
