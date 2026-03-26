import pc from 'picocolors';

export const log = {
  info: (...args: unknown[]) => console.error(pc.blue('[smartcode]'), ...args),
  warn: (...args: unknown[]) => console.error(pc.yellow('[smartcode]'), ...args),
  error: (...args: unknown[]) => console.error(pc.red('[smartcode]'), ...args),
  debug: (...args: unknown[]) => {
    if (process.env['DEBUG']) console.error(pc.dim('[smartcode]'), ...args);
  },
};
