// File: src/core/logger/index.ts
//
// Structured, levelled logging with secret redaction. Wraps console output so
// request/response bodies, env dumps, etc. never leak PATs, passwords or
// tokens into the console, CI logs, traces or reports.

const SECRET_ENV_KEYS = [
  'ADO_PAT',
  'ADMIN_PASSWORD',
  'UNDERWRITER_PASSWORD',
  'AGENT_PASSWORD',
  'VIEWER_PASSWORD',
  'DB_PASSWORD',
  'ENCRYPTION_KEY',
  'TEAMS_WEBHOOK_URL',
] as const;

const SECRET_KEY_PATTERN = /token|password|secret|pat|authorization|apikey|api_key/i;

function secretValues(): string[] {
  return SECRET_ENV_KEYS
    .map(key => process.env[key])
    .filter((value): value is string => Boolean(value && value.length > 3));
}

/** Replace any known secret values found in a string with a redaction marker. */
export function redact(input: string): string {
  let out = input;
  for (const secret of secretValues()) {
    out = out.split(secret).join('[REDACTED]');
  }
  return out;
}

/** Recursively redact object values whose key looks secret-shaped. */
function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(val);
    }
    return out;
  }
  return value;
}

export function redactJson(value: unknown): string {
  return JSON.stringify(redactValue(value), null, 2);
}

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel(): Level {
  const env = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (env in LEVEL_ORDER ? env : 'info') as Level;
}

function emit(level: Level, scope: string, message: string, data?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;

  const line = `[${level.toUpperCase()}] [${scope}] ${redact(message)}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  out(line);
  if (data !== undefined) out(redactJson(data));
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

/** Create a scoped logger, e.g. `createLogger('apiClient')`. */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => emit('debug', scope, message, data),
    info: (message, data) => emit('info', scope, message, data),
    warn: (message, data) => emit('warn', scope, message, data),
    error: (message, data) => emit('error', scope, message, data),
  };
}
