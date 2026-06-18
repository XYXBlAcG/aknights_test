let debugEnabled = false;

export function setDebugLogging(enabled) {
  debugEnabled = Boolean(enabled);
}

export const logger = {
  info: (...args) => console.info('[game]', ...args),
  warn: (...args) => console.warn('[game]', ...args),
  error: (...args) => console.error('[game]', ...args),
  debug: (...args) => {
    if (debugEnabled) {
      console.debug('[game]', ...args);
    }
  }
};
