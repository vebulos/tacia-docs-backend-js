import log4js from 'log4js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const logDir = path.join(__dirname, 'logs');
if (!existsSync(logDir)) {
  await mkdir(logDir, { recursive: true });
}

// Log4js configuration
log4js.configure({
  appenders: {
    console: { 
      type: 'console',
      layout: {
        type: 'pattern',
        pattern: '%[[%d{yyyy-MM-dd hh:mm:ss.SSS}] [%p] %c -%] %m'
      }
    },
    file: { 
      type: 'file', 
      filename: path.join(logDir, 'app.log'),
      maxLogSize: 10485760, // 10MB
      backups: 5,
      compress: true,
      layout: {
        type: 'pattern',
        pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %c - %m'
      }
    }
  },
  categories: {
    default: { 
      appenders: ['console', 'file'], 
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug' 
    }
  }
});

// Function to get caller information (filename and line number only)
const getCallerInfo = () => {
  const stack = new Error().stack.split('\n')[3];
  const match = stack.match(/at .*?[\\/]([^\\/)]+?):(\d+):\d+\)?$/);
  if (match) {
    //return `[${match[1]}:${match[2]}]`;
    return `[l.${match[2]}]`;
  }
  return '';
};

// Create a logger with category
const createLogger = (category) => {
  const logger = log4js.getLogger(category);
  
  return {
    trace: (message) => logger.trace(`${getCallerInfo()} ${message}`),
    debug: (message) => logger.debug(`${getCallerInfo()} ${message}`),
    info: (message) => logger.info(`${getCallerInfo()} ${message}`),
    warn: (message) => logger.warn(`${getCallerInfo()} ${message}`),
    error: (message, error) => {
      if (error instanceof Error) {
        logger.error(`${getCallerInfo()} ${message} - ${error.message}\n${error.stack}`);
      } else {
        logger.error(`${getCallerInfo()} ${message}`);
      }
    },
    fatal: (message) => logger.fatal(`${getCallerInfo()} ${message}`)
  };
};

// Default logger
export const Logger = createLogger('app');

// For backward compatibility
export const LOG = Logger;

// Export createLogger function
export { createLogger };
