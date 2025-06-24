import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get CONTENT_DIR from the server configuration
import { CONTENT_DIR } from '../server.js';

/**
 * Handler for fetching content structure
 * @param {Request} req - HTTP request object
 * @param {Response} res - HTTP response object
 */
export async function getContentStructure(req, res) {
  try {
    // Get path from query or use root
    const requestedPath = req.query?.path || '';
    console.log('[content-structure] Requested path:', requestedPath);
    
    // Normalize and secure the path
    const safePath = path.normalize(requestedPath)
      .replace(/^(\.\.(\/|\\|$))+/, '')  // Prevent directory traversal
      .replace(/^\/+/, '');              // Remove leading slashes
    
    // Determine the full path to the directory
    const fullPath = path.join(CONTENT_DIR, safePath);
    
    // Check if the content directory exists
    try {
      // First check if the base content directory exists
      try {
        const contentDirStats = await fs.stat(CONTENT_DIR);
        if (!contentDirStats.isDirectory()) {
          console.error(`[content-structure] Base content directory is not a directory: ${CONTENT_DIR}`);
          res.statusCode = 500;
          return res.json({ error: 'Content directory configuration error' });
        }
      } catch (contentDirError) {
        console.error(`[content-structure] Base content directory not found: ${CONTENT_DIR}`, contentDirError);
        res.statusCode = 500;
        return res.json({ error: 'Content directory not found', details: contentDirError.message });
      }
      
      // Now check the requested path
      console.log(`[content-structure] Checking path: ${fullPath}`);
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        console.warn(`[content-structure] Path is not a directory: ${fullPath}`);
        res.statusCode = 400;
        return res.json({ error: 'Path is not a directory' });
      }
    } catch (error) {
      console.warn(`[content-structure] Directory not found: ${fullPath}`, error);
      res.statusCode = 404;
      return res.json({ error: 'Directory not found', details: error.message });
    }
    
    // Read the directory contents
    console.log(`[content-structure] Reading directory: ${fullPath}`);
    const files = await fs.readdir(fullPath);
    console.log(`[content-structure] Found ${files.length} files/directories`);
    
    // Process each file/directory to create content items
    const contentItems = await Promise.all(files.map(async (name) => {
      const itemPath = path.join(fullPath, name);
      const stats = await fs.stat(itemPath);
      
      // Determine the relative path for the item
      const relativePath = path.join(safePath, name).replace(/\\/g, '/');
      
      // Basic content item structure
      const contentItem = {
        name,
        path: relativePath,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        lastModified: stats.mtime
      };
      
      // For markdown files, try to extract title from front matter
      if (!stats.isDirectory() && name.endsWith('.md')) {
        try {
          const content = await fs.readFile(itemPath, 'utf8');
          const titleMatch = content.match(/title:\\s*["']?([^"'\\n]+)["']?/i);
          if (titleMatch && titleMatch[1]) {
            contentItem.title = titleMatch[1].trim();
          }
        } catch (error) {
          // Ignore errors reading individual files
          console.error(`Error reading file ${name}:`, error);
        }
      }
      
      return contentItem;
    }));
    
    // Sort content items: files first, then directories
    const sortedItems = contentItems.sort((a, b) => {
      // If one is a directory and the other is not, the file comes first
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? 1 : -1; // Files (false) come before directories (true)
      }
      // If both are the same type, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
    
    // Add anti-cache headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Return the sorted content items as JSON
    console.log(`[content-structure] Returning ${sortedItems.length} sorted content items (files first)`);
    return res.json(sortedItems);
    
  } catch (error) {
    console.error('[content-structure] Error getting content structure:', error);
    res.statusCode = 500;
    return res.json({ error: 'Failed to get content structure', details: error.message, stack: error.stack });
  }
}
