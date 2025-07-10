import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { access } from 'fs/promises';
import { config } from './config/app.config.js';
import { createLogger } from './logger.js';

const LOG = createLogger('Server');

// Import controllers
import ContentController from './controllers/ContentController.js';
import StructureController from './controllers/StructureController.js';
import FirstDocumentController from './controllers/FirstDocumentController.js';
import RelatedController from './controllers/RelatedController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key.startsWith('--')) {
    acc[key.slice(2)] = value || true;
  }
  return acc;
}, {});

// Get content directory from args or config
const contentDir = args['content-dir'] || config.contentDir;

// Handle Cygwin paths (starts with /cygdrive/)
let processedContentDir = contentDir;
if (contentDir.startsWith('/cygdrive/')) {
  // Convert /cygdrive/c/... to c:/...
  const pathParts = contentDir.split('/').filter(Boolean);
  if (pathParts.length >= 3) {
    const driveLetter = pathParts[1].charAt(0).toUpperCase();
    const restOfPath = pathParts.slice(2).join('/');
    processedContentDir = `${driveLetter}:/${restOfPath}`;
  }
}

// Resolve the final content directory path
export const CONTENT_DIR = path.resolve(processedContentDir);

// Set port from args, env or config
const PORT = args.port || process.env.PORT || config.port;

// Validate content directory exists and is accessible
try {
  if (!existsSync(CONTENT_DIR)) {
    throw new Error(`Directory does not exist: ${CONTENT_DIR}`);
  }
  
  // Try to read the directory to verify access
  await access(CONTENT_DIR);
  
  LOG.info(`Using content directory: ${CONTENT_DIR}`);
  LOG.info('Content directory is accessible');
} catch (error) {
  LOG.error(`Content directory error: ${error.message}`, error);
  process.exit(1);
}

/**
 * Minimal HTTP server for Markdown Content API
 */
function createServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    // Get the origin from the request
    const origin = req.headers.origin || '*';
    
    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma, Expires');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control, Expires');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Default response headers
    res.setHeader('Content-Type', 'application/json');
    
    try {
      // API Routes
      if (pathname.startsWith('/api/')) {
        // Extract the API path
        const apiPath = pathname.replace(/^\/api\//, '');
        
        // Create request object with parsed data
        const request = { 
          ...req, 
          query, 
          params: {},
          method: req.method
        };

        // Handle specific API endpoints first
        if (apiPath === 'first-document' || apiPath.startsWith('first-document/')) {
          const pathPart = apiPath === 'first-document' ? '' : apiPath.replace('first-document/', '');
          request.params.path = decodeURIComponent(pathPart).trim();
          await FirstDocumentController.getFirstDocument(request, res);
          return;
        }
        
        if (apiPath === 'related' && req.method === 'GET') {
          await RelatedController.getRelatedDocuments(request, res);
          return;
        }

        // Route to appropriate controller
        if (apiPath === 'content' || apiPath.startsWith('content/')) {
          // Handle content requests (files)
          const pathPart = apiPath === 'content' ? '' : apiPath.replace('content/', '');
          const decodedPath = decodeURIComponent(pathPart).trim();
          
          // If no extension, it's a directory - return a clear message
          if (path.extname(decodedPath) === '') {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'Directory listing not available',
              message: 'Use /api/structure/ to list directory contents',
              path: decodedPath,
              suggestedUrl: `/api/structure/${decodedPath}`.replace(/\/+$/, '')
            }));
            return;
          }
          
          // Handle as file using ContentController
          request.params.path = decodedPath;
          await ContentController.handleRequest(request, res);
          return;
        }
        
        // Handle structure endpoint
        if (apiPath === 'structure' || apiPath.startsWith('structure/')) {
          // Handle structure requests (directories)
          const pathPart = apiPath === 'structure' ? '' : apiPath.replace('structure/', '');
          request.params.path = decodeURIComponent(pathPart).trim();
          await StructureController.handleRequest(request, res);
          return;
        }
        
        // Handle root path or paths without extensions as directory listings
        if (apiPath === '' || !path.extname(apiPath)) {
          request.params.path = decodeURIComponent(apiPath).trim();
          await StructureController.handleRequest(request, res);
          return;
        }
        
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      // Health check endpoint
      if (pathname === '/health') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('OK');
        return;
      }

      // Default route
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Markdown Content API is running');
      return;
      
    } catch (error) {
      LOG.error('Error processing request:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ 
          error: 'Internal Server Error',
          details: error.message,
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        }));
      }
      return;
    }

    // Fallback for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '0.0.0.0', () => {
    LOG.info(`Server is running on http://localhost:${PORT}`);
  });
}

createServer();
