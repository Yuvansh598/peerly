type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  roomId?: string | null;
  socketId?: string | null;
  userId?: string | null;
  event?: string;
  duration?: number;
  reason?: string;
  [key: string]: any;
}

const isProduction = process.env.NODE_ENV === 'production';
const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (isProduction ? 'info' : 'debug');

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const payload = {
    timestamp,
    level,
    message,
    ...context,
  };

  if (isProduction) {
    return JSON.stringify(payload);
  }

  const ctxStr = context && Object.keys(context).length > 0 
    ? ` ${JSON.stringify(context)}` 
    : '';

  return `[${timestamp}] [${level.toUpperCase()}] ${message}${ctxStr}`;
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (shouldLog('debug')) {
      console.debug(formatLog('debug', message, context));
    }
  },

  info(message: string, context?: LogContext) {
    if (shouldLog('info')) {
      console.info(formatLog('info', message, context));
    }
  },

  warn(message: string, context?: LogContext) {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, context));
    }
  },

  error(message: string, context?: LogContext) {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, context));
    }
  },
};
