import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import MarkdownService from '../services/markdown.service.js';
import * as ContentService from '../services/content.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get CONTENT_DIR from the server configuration
import { CONTENT_DIR } from '../server.js';

/**
 * Handler for fetching and parsing markdown content.
 * @param {Request} req - HTTP request object
 * @param {Response} res - HTTP response object
 */
export async function getMarkdownContent(req, res) {
  try {
    // Get markdown path from params first, then query for backward compatibility
    let requestedPath = req.params?.path || req.query?.path || '';
    
    // If path is provided in both params and query, use the one from params
    if (req.params?.path && req.query?.path) {
      console.log(`[content] Path provided in both params and query, using params: ${req.params.path}`);
      requestedPath = req.params.path;
      // Remove the query parameter to avoid any confusion
      delete req.query.path;
    }
    
    requestedPath = decodeURIComponent(requestedPath).trim();
    
    console.log(`[content] Processing markdown request for path: ${requestedPath}`);
    console.log(`[content] Params:`, req.params);
    console.log(`[content] Query:`, req.query);

    // Import the ContentController
    const ContentController = (await import('../controllers/ContentController.js')).default;
    
    // If path is empty, handle root content structure
    if (!requestedPath) {
      console.log('[content] No path provided, handling root content structure');
      return ContentController.handleRequest(req, res);
    }
    
    // For non-empty paths, forward to the ContentController
    req.params = { path: requestedPath };
    return ContentController.handleRequest(req, res);
  } catch (error) {
    console.error('[content] Unexpected error processing request:', error);
    res.statusCode = 500;
    return res.json({ 
      error: 'Internal Server Error', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}

/**
 * Handler for finding the first document in a directory
 * @param {Request} req - HTTP request object
 * @param {Response} res - HTTP response object
 */
export async function getFirstDocument(req, res) {
  try {
    // Get directory from query params or use empty string for root
    const directory = req.query.directory || '';
    
    console.log(`[content] Finding first document in directory: '${directory}'`);
    
    // Add anti-cache headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Use the ContentService to find the first document in the specified directory
    const result = await ContentService.findFirstDocument(directory);
    
    // If there was an error, return appropriate status code
    if (result.error) {
      console.error(`[content] Error from ContentService: ${result.error}`);
      res.statusCode = 500;
      return res.json({ 
        error: result.error,
        path: null,
        details: result.details
      });
    }
    
    // Return the path (which may be null if no document was found)
    return res.json({ 
      path: result.path,
      directory: directory || null
    });
  } catch (error) {
    console.error('[content] Unexpected error finding first document:', error);
    res.statusCode = 500;
    return res.json({ 
      error: 'Failed to find first document', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}
