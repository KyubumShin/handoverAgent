import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { ensureDir } from './session-store.mjs';

const START_MARKER = '<!-- HANDOVER:START -->';
const END_MARKER = '<!-- HANDOVER:END -->';

export function readManagedSection(filePath) {
  if (!existsSync(filePath)) return '';
  const content = readFileSync(filePath, 'utf8');
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) return '';
  return content.slice(startIdx + START_MARKER.length, endIdx).trim();
}

export function writeManagedSection(filePath, sectionContent) {
  ensureDir(dirname(filePath));

  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf8');
  }

  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  const managed = `${START_MARKER}\n${sectionContent}\n${END_MARKER}`;

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing managed section
    content = content.slice(0, startIdx) + managed + content.slice(endIdx + END_MARKER.length);
  } else {
    // Append managed section
    content = content.trimEnd() + '\n\n' + managed + '\n';
  }

  writeFileSync(filePath, content);
}

export function ensureMarkers(filePath) {
  if (!existsSync(filePath)) {
    ensureDir(dirname(filePath));
    writeFileSync(filePath, `${START_MARKER}\n${END_MARKER}\n`);
    return;
  }
  const content = readFileSync(filePath, 'utf8');
  if (!content.includes(START_MARKER)) {
    writeFileSync(filePath, content.trimEnd() + `\n\n${START_MARKER}\n${END_MARKER}\n`);
  }
}

export function pruneByAge(content, maxDays) {
  const lines = content.split('\n');
  const now = Date.now();
  const maxMs = maxDays * 24 * 60 * 60 * 1000;

  return lines.filter(line => {
    // Match date patterns like [02/19] or [2026-02-19]
    const dateMatch = line.match(/\[(\d{2})\/(\d{2})\]/);
    if (!dateMatch) return true; // Keep non-dated lines (headers, etc.)

    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    const year = new Date().getFullYear();
    const entryDate = new Date(year, month, day);

    // Handle year boundary — if entry appears >30 days in the future, assume last year
    if (entryDate.getTime() > now + 30 * 86400000) {
      entryDate.setFullYear(year - 1);
    }

    return (now - entryDate.getTime()) <= maxMs;
  }).join('\n');
}

export function pruneBySize(content, maxChars) {
  if (content.length <= maxChars) return content;

  const lines = content.split('\n');

  // Index dated lines (preserving original positions)
  const datedIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/\[(\d{2})\/(\d{2})\]/)) {
      datedIndices.push(i);
    }
  }

  // Remove oldest dated lines until under limit (oldest = earliest in array)
  const removed = new Set();
  let result = content;
  let removeIdx = 0;

  while (result.length > maxChars && removeIdx < datedIndices.length) {
    removed.add(datedIndices[removeIdx]);
    removeIdx++;
    result = lines.filter((_, i) => !removed.has(i)).join('\n');
  }

  return result;
}
