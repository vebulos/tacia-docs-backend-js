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
    // Get markdown path from query or params
    let requestedPath = req.query?.path || req.params?.path || '';
    if (!requestedPath && req.url.startsWith('/api/content/')) {
      requestedPath = req.url.replace('/api/content/', '');
    }
    requestedPath = decodeURIComponent(requestedPath);
    
    console.log(`[content] Processing markdown request for path: ${requestedPath}`);

    // Normalize and secure the path
    let safePath = path.normalize(requestedPath)
      .replace(/^([\/])+/, '')
      .replace(/\/\.\.\//g, '/')
      .replace(/[\/]+/g, '/');
    
    // Ensure the path has .md extension
    if (!safePath.endsWith('.md')) {
      safePath = `${safePath}.md`;
    }
    
    const fullPath = path.join(CONTENT_DIR, safePath);
    
    // Security check to prevent path traversal attacks
    if (!fullPath.startsWith(CONTENT_DIR)) {
      console.warn(`[content] Security warning: Attempted path traversal: ${requestedPath}`);
      res.statusCode = 400;
      return res.json({ error: 'Invalid path', details: 'Path traversal not allowed' });
    }
    
    console.log(`[content] Reading file from: ${fullPath}`);

    // Check if file exists before attempting to read it
    try {
      await fs.access(fullPath);
    } catch (accessError) {
      console.warn(`[content] File not found: ${fullPath}`);
      res.statusCode = 404;
      return res.json({ 
        error: 'Document not found', 
        details: 'The requested document could not be found',
        path: safePath
      });
    }
    
    // Read the markdown file
    let fileContent;
    try {
      fileContent = await fs.readFile(fullPath, 'utf8');
    } catch (readError) {
      console.error(`[content] Error reading file: ${fullPath}`, readError);
      res.statusCode = 500;
      return res.json({ 
        error: 'Failed to read document', 
        details: readError.message,
        path: safePath
      });
    }
    
    // Parse the markdown content
    let html, metadata, headings;
    try {
      const parsed = MarkdownService.parseMarkdownFile(fileContent);
      html = parsed.html;
      metadata = parsed.metadata;
      headings = parsed.headings;
    } catch (parseError) {
      console.error(`[content] Error parsing markdown: ${fullPath}`, parseError);
      res.statusCode = 500;
      return res.json({ 
        error: 'Failed to parse markdown', 
        details: parseError.message,
        path: safePath
      });
    }
    
    const name = path.basename(safePath, '.md'); // Remove .md extension
    
    console.log(`[content] Successfully processed markdown: ${safePath}`);
    console.log(`[content] Found ${headings.length} headings, metadata:`, metadata);
    
    return res.json({
      html,
      metadata,
      headings,
      path: safePath,
      name
    });
  } catch (error) {
    console.error('[content] Unexpected error processing markdown:', error);
    res.statusCode = 500;
    return res.json({ 
      error: 'Failed to process markdown', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
}

/**
 * Handler for finding the first document in any content folder
 * @param {Request} req - HTTP request object
 * @param {Response} res - HTTP response object
 */
export async function getFirstDocument(req, res) {
  try {
    console.log('[content] Finding first document using ContentService');
    
    // Add anti-cache headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Use the ContentService to find the first document
    const result = await ContentService.findFirstDocument();
    
    // If there was an error, return appropriate status code
    if (result.error) {
      console.error(`[content] Error from ContentService: ${result.error}`);
      res.statusCode = 500;
      return res.json({ 
        error: result.error,
        path: null
      });
    }
    
    // Return the path (which may be null if no document was found)
    return res.json({ path: result.path });
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
