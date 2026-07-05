// Minimal leveled logger. The active level comes from LOG_LEVEL
// (error | warn | info | debug) and defaults to 'info' in production, 'debug'
// otherwise — so high-frequency per-request and [DB] logs stay out of production
// output while errors and warnings are always emitted.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

function resolveLevel(): Level {
  const env = (process.env.LOG_LEVEL || '').toLowerCase();
  if (env in LEVELS) return env as Level;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const threshold = LEVELS[resolveLevel()];

function emit(level: Level, args: unknown[]) {
  if (LEVELS[level] > threshold) return;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(...args);
}

export const logger = {
  error: (...args: unknown[]) => emit('error', args),
  warn: (...args: unknown[]) => emit('warn', args),
  info: (...args: unknown[]) => emit('info', args),
  debug: (...args: unknown[]) => emit('debug', args),
};
