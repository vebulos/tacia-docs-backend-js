import http from 'http';
import url from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { access } from 'fs/promises';
import { config } from './config/app.config.js';
import { getMarkdownContent, getFirstDocument } from './routes/content.routes.js';
import { getRelatedDocuments } from './routes/related.routes.js';

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
  
  console.log(`[server] Using content directory: ${CONTENT_DIR}`);
  console.log('[server] Content directory is accessible');
} catch (error) {
  console.error(`[ERROR] Content directory error: ${error.message}`);
  process.exit(1);
}

/**
 * Minimal HTTP server for Markdown Content API
 */
async function createServer() {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for all API requests
    const allowedOrigins = ['http://localhost:4200', 'http://localhost:8080'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const parsedUrl = url.parse(req.url, true);

    // Patch res.json for convenience for all routes
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    // Route for /api/content/some/path
    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/api/content/')) {
      const pathParam = parsedUrl.pathname.substring('/api/content/'.length);
      req.params = { path: pathParam };
      
      // Parse query parameters properly
      const queryParams = {};
      for (const [key, value] of Object.entries(parsedUrl.query || {})) {
        queryParams[key] = value;
      }
      req.query = queryParams;
      
      console.log(`[server content] GET /api/content/${pathParam} with query:`, req.query);
      await getMarkdownContent(req, res);
      return;
    }

    // Route for related documents API
    if (req.method === 'GET' && parsedUrl.pathname === '/api/related') {
      // Parse query parameters properly
      const queryParams = {};
      for (const [key, value] of Object.entries(parsedUrl.query || {})) {
        queryParams[key] = value;
      }
      req.query = queryParams;
      
      // Log the request for debugging
      console.log('[server related] GET /api/related with query:', req.query);
      
      await getRelatedDocuments(req, res);
      return;
    }
    
    // Route for finding the first document in the first content folder
    if (req.method === 'GET' && parsedUrl.pathname === '/api/first-document') {
      // Parse query parameters properly
      const queryParams = {};
      for (const [key, value] of Object.entries(parsedUrl.query || {})) {
        queryParams[key] = value;
      }
      req.query = queryParams;
      
      // Log the request for debugging
      console.log('[server first-document] GET /api/first-document');
      
      await getFirstDocument(req, res);
      return;
    }

    // Fallback for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[server fallback] Server is running on http://localhost:${PORT}`);
  });
}

createServer();
