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

