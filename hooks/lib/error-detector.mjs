const ERROR_PATTERNS = [
  { regex: /error\s*TS\d+/i, type: 'type_error' },
  { regex: /SyntaxError/i, type: 'build_error' },
  { regex: /TypeError|ReferenceError|RangeError/i, type: 'runtime_error' },
  { regex: /FAIL\s/i, type: 'test_failure' },
  { regex: /ERR!|ENOENT|EACCES|ECONNREFUSED/i, type: 'runtime_error' },
  { regex: /Build failed|build error|compilation failed/i, type: 'build_error' },
  { regex: /error:|Error:/i, type: 'build_error' },
  { regex: /npm ERR!/i, type: 'build_error' },
  { regex: /exit code [1-9]|exited with code [1-9]/i, type: 'runtime_error' },
  { regex: /AssertionError|assert\./i, type: 'test_failure' },
  { regex: /✕|✗|FAILED/i, type: 'test_failure' },
];

const FILE_LINE_PATTERN = /(?:at\s+)?([^\s:()]+\.[a-z]{1,4}):(\d+)/i;

const INSTRUCTION_PATTERNS = [
  /\bi told you to\b/i,
  /\bi already said\b/i,
  /\bdon'?t do that\b/i,
  /\bstop doing\b/i,
  /\bstop changing\b/i,
  /\bthat'?s wrong\b/i,
  /\bthat'?s incorrect\b/i,
  /\bnot what i asked\b/i,
  /\bnot what i wanted\b/i,
  /\byou ignored\b/i,
  /\byou missed\b/i,
  /\byou forgot\b/i,
  /\byou were supposed to\b/i,
  /\bwhy did you\b/i,
  /\bread the instructions\b/i,
  /\bi didn'?t ask\b/i,
  /\bi didn'?t say\b/i,
  /\bi didn'?t want\b/i,
  /\bno,\s+/i,
];

export function detectErrors(output) {
  if (!output || typeof output !== 'string') return [];

  const errors = [];
  const lines = output.split('\n');

  for (const line of lines) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.regex.test(line)) {
        const fileLine = line.match(FILE_LINE_PATTERN);
        errors.push({
          error: line.trim().slice(0, 150),
          type: pattern.type,
          file: fileLine ? fileLine[1] : undefined,
          line: fileLine ? parseInt(fileLine[2]) : undefined,
        });
        break; // One classification per line
      }
    }
  }

  return errors;
}

export function categorizeError(errorText) {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.regex.test(errorText)) return pattern.type;
  }
  return 'unknown_error';
}

/**
 * Strip stack traces, normalize whitespace, extract core message.
 */
export function summarizeError(rawText) {
  if (!rawText) return '';
  return rawText
    .split('\n')
    .filter(line => !/^\s+at\s/.test(line))  // strip stack trace lines
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
}

/**
 * Format error info for the session log (new format with cause/summary/raw).
 */
export function formatForLog(tool, errorInfo) {
  const cause = errorInfo.file
    ? `${errorInfo.file}${errorInfo.line ? ':' + errorInfo.line : ''}`
    : tool;
  return {
    tool,
    type: errorInfo.type,
    cause,
    summary: summarizeError(errorInfo.error),
    raw: (errorInfo.error || '').slice(0, 500),
  };
}

/**
 * Detect instruction violations from user prompt text.
 * Returns { signal, summary } or null.
 * Conservative: only triggers on short prompts (<300 chars) to avoid false positives.
 */
export function detectInstructionViolation(promptText) {
  if (!promptText || promptText.length > 300) return null;

  for (const pattern of INSTRUCTION_PATTERNS) {
    const match = promptText.match(pattern);
    if (match) {
      return {
        signal: match[0].trim(),
        summary: promptText.slice(0, 100),
      };
    }
  }
  return null;
}
