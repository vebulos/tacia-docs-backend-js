/**
 * Simple logger utility for server
 */
class Logger {
  static info(message) {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`);
  }
  static error(message, error) {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error || '');
  }
  static debug(message, data) {
    if (process.env.DEBUG) {
      console.debug(`[${new Date().toISOString()}] DEBUG: ${message}`, data || '');
    }
  }
}
module.exports = Logger;
