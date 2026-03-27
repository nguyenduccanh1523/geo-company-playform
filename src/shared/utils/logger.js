/**
 * LOGGER UTILITY
 *
 * Sử dụng:
 * logger.info('User created', { userId: 123 });
 * logger.error('Database error', error);
 * logger.warn('Rate limit reached');
 * logger.debug('Debug info');
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const COLORS = {
  DEBUG: "\x1b[36m", // Cyan
  INFO: "\x1b[32m", // Green
  WARN: "\x1b[33m", // Yellow
  ERROR: "\x1b[31m", // Red
  RESET: "\x1b[0m",
};

class Logger {
  constructor(context = "App") {
    this.context = context;
    this.minLevel = LOG_LEVELS[process.env.LOG_LEVEL || "INFO"];
  }

  formatTimestamp() {
    return new Date().toISOString();
  }

  formatMessage(level, message, data = null) {
    const timestamp = this.formatTimestamp();
    const color = COLORS[level];
    const reset = COLORS.RESET;

    let formattedMsg = `${color}[${timestamp}] [${level}] [${this.context}] ${message}${reset}`;

    if (data) {
      if (data instanceof Error) {
        formattedMsg += `\n${color}Error: ${data.message}${reset}`;
        if (data.stack) {
          formattedMsg += `\n${color}${data.stack}${reset}`;
        }
      } else {
        formattedMsg += `\n${color}${JSON.stringify(data, null, 2)}${reset}`;
      }
    }

    return formattedMsg;
  }

  debug(message, data = null) {
    if (LOG_LEVELS.DEBUG >= this.minLevel) {
      console.log(this.formatMessage("DEBUG", message, data));
    }
  }

  info(message, data = null) {
    if (LOG_LEVELS.INFO >= this.minLevel) {
      console.log(this.formatMessage("INFO", message, data));
    }
  }

  warn(message, data = null) {
    if (LOG_LEVELS.WARN >= this.minLevel) {
      console.warn(this.formatMessage("WARN", message, data));
    }
  }

  error(message, data = null) {
    if (LOG_LEVELS.ERROR >= this.minLevel) {
      console.error(this.formatMessage("ERROR", message, data));
    }
  }
}

export const logger = new Logger("GeoApp");

export function createLogger(context) {
  return new Logger(context);
}
