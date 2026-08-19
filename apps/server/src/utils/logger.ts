type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentThreshold(): number {
  const configured = process.env.LOG_LEVEL;
  if (configured === 'debug' || configured === 'info' || configured === 'warn' || configured === 'error') {
    return LEVEL_ORDER[configured];
  }
  return process.env.NODE_ENV === 'test' ? LEVEL_ORDER.error : LEVEL_ORDER.info;
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < currentThreshold()) {
    return;
  }
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

/**
 * Structured logging so failures are greppable in a deployed environment. The
 * original code used bare `console.log(err)`, which loses the request context
 * that makes an error actionable.
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
