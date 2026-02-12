import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import type { KnowledgeEntry, Citation } from '../agent/types.js';

/**
 * Show the welcome banner.
 */
export function banner(): void {
  const title = chalk.bold.cyan('Handover Agent');
  const subtitle = chalk.gray('AI-powered knowledge transfer assistant');
  const version = chalk.dim('v0.1.0');

  const content = `${title}  ${version}\n\n${subtitle}`;

  console.log(
    boxen(content, {
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'cyan',
    }),
  );
}

/**
 * Print a success message with a green checkmark.
 */
export function success(msg: string): void {
  console.log(`${chalk.green('✔')} ${msg}`);
}

/**
 * Print an error message with a red X.
 */
export function error(msg: string): void {
  console.log(`${chalk.red('✖')} ${msg}`);
}

/**
 * Print a warning message with a yellow indicator.
 */
export function warn(msg: string): void {
  console.log(`${chalk.yellow('⚠')} ${msg}`);
}

/**
 * Print an info message with a blue indicator.
 */
export function info(msg: string): void {
  console.log(`${chalk.blue('ℹ')} ${msg}`);
}

/**
 * Create and return an ora spinner instance.
 */
export function createSpinner(text: string): ReturnType<typeof ora> {
  return ora({ text, color: 'cyan' });
}

/**
 * Format data as a simple table string.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = rows.reduce((max, row) => {
      const cellLen = (row[i] ?? '').length;
      return cellLen > max ? cellLen : max;
    }, 0);
    return Math.max(h.length, maxDataWidth);
  });

  // Build header row
  const headerRow = headers
    .map((h, i) => chalk.bold(h.padEnd(colWidths[i]!)))
    .join('  ');

  // Build separator
  const separator = colWidths.map((w) => chalk.dim('-'.repeat(w))).join('  ');

  // Build data rows
  const dataRows = rows.map((row) =>
    row.map((cell, i) => (cell ?? '').padEnd(colWidths[i]!)).join('  '),
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Pretty print a knowledge entry.
 */
export function formatKnowledgeEntry(entry: KnowledgeEntry): string {
  const lines: string[] = [];

  lines.push(chalk.bold.white(entry.title));
  lines.push(chalk.dim(`ID: ${entry.id} | Category: ${entry.category}`));

  if (entry.tags.length > 0) {
    lines.push(chalk.cyan(`Tags: ${entry.tags.join(', ')}`));
  }

  lines.push('');
  lines.push(entry.content);
  lines.push('');

  const confidence = Math.round(entry.confidence * 100);
  const confidenceColor =
    confidence >= 80 ? chalk.green : confidence >= 50 ? chalk.yellow : chalk.red;
  lines.push(
    chalk.dim(
      `Confidence: ${confidenceColor(`${confidence}%`)} | ` +
        `Source: ${entry.source.type}${entry.source.path ? ` (${entry.source.path})` : ''} | ` +
        `Updated: ${entry.updatedAt}`,
    ),
  );

  return lines.join('\n');
}

/**
 * Pretty print a citation.
 */
export function formatCitation(citation: Citation): string {
  const lines: string[] = [];

  lines.push(chalk.dim(`[${citation.entryId}]`) + ' ' + chalk.bold(citation.title));

  if (citation.excerpt) {
    const truncated =
      citation.excerpt.length > 200
        ? citation.excerpt.slice(0, 200) + '...'
        : citation.excerpt;
    lines.push(chalk.italic.gray(`"${truncated}"`));
  }

  const sourceInfo = citation.source.path
    ? `${citation.source.type}: ${citation.source.path}`
    : citation.source.type;
  lines.push(chalk.dim(`  Source: ${sourceInfo}`));

  return lines.join('\n');
}
