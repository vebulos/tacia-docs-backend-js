/**
 * Server configuration constants
 */

const path = require('path');

// Default configuration
const DEFAULT_PORT = 4201;
const DEFAULT_CONTENT_DIR = path.join(process.cwd(), 'src', 'assets', 'content');

// Cache settings
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// MIME types for content files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown',
  '.txt': 'text/plain'
};

// Export constants
module.exports = {
  DEFAULT_PORT,
  DEFAULT_CONTENT_DIR,
  CACHE_TTL,
  MIME_TYPES
};
