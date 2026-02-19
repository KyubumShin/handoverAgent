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

export function formatForLog(tool, errorInfo) {
  return {
    tool,
    error: errorInfo.error,
    type: errorInfo.type,
    file: errorInfo.file,
    line: errorInfo.line,
  };
}
