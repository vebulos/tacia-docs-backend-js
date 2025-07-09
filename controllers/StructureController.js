import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import { createLogger } from '../logger.js';

const LOG = createLogger('StructureController');

/**
 * Controller for handling directory structure requests
 */
class StructureController {
  /**
   * Handle directory structure requests
   * @param {http.IncomingMessage} req - HTTP request object
   * @param {http.ServerResponse} res - HTTP response object
   */
  async handleRequest(req, res) {
    try {
      // the path is already extracted by the router
      const contentPath = req.params?.path || '';
      return this.handleContentStructure(res, contentPath, req.query || {});
    } catch (error) {
      this.handleError(res, error, 'Error handling structure request');
    }
  }

  /**
   * Handle content structure requests (directories)
   * @private
   */
  async handleContentStructure(res, contentPath, queryParams) {
    try {
      LOG.debug(`Handling structure request for: ${contentPath || 'root'}`);
      
      // Handle root path
      if (!contentPath || contentPath === '/' || contentPath === '') {
        return this.listDirectoryContents(res, CONTENT_DIR, '');
      }
      
      // Normalize and secure the path
      const safePath = path.normalize(contentPath)
        .replace(/^(\/\.\.|\/\.|\\.\.|\\.)+/g, '')  // Prevent directory traversal
        .replace(/^[/\\]+/, '')  // Remove leading slashes
        .replace(/[/\\]+/g, '/'); // Normalize path separators
      
      // Determine the full path to the directory
      const fullPath = path.join(CONTENT_DIR, safePath);
      
      // Security check to prevent path traversal
      if (!fullPath.startsWith(CONTENT_DIR)) {
        LOG.warn(`Security warning: Attempted path traversal: ${contentPath}`);
        return this.sendResponse(res, 400, { 
          error: 'Invalid path', 
          details: 'Path traversal not allowed' 
        });
      }
      
      // Check if the requested path exists and is a directory
      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) {
          LOG.warn(`Path is not a directory: ${fullPath}`);
          return this.sendResponse(res, 400, { 
            error: 'Path is not a directory',
            path: contentPath
          });
        }
        
        // If we get here, the path exists and is a directory
        return this.listDirectoryContents(res, fullPath, contentPath);
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          LOG.warn(`Directory not found: ${fullPath}`);
          return this.sendResponse(res, 404, { 
            error: 'Directory not found',
            path: contentPath
          });
        }
        throw error; // Re-throw other errors
      }
      
    } catch (error) {
      this.handleError(res, error, 'Error handling content structure');
    }
  }

  /**
   * List contents of a directory
   * @private
   */
  async listDirectoryContents(res, fullPath, contentPath) {
    try {
      LOG.debug(`Reading directory: ${fullPath}`);
      const files = await fs.readdir(fullPath);
      LOG.debug(`Found ${files.length} files/directories`);
      
      // Process each file/directory to create content items
      const contentItems = await Promise.all(files.map(async (name) => {
        const itemPath = path.join(fullPath, name);
        const stats = await fs.stat(itemPath);
        
        // Determine the relative path for the item
        const relativePath = path.join(contentPath, name).replace(/\\/g, '/');
        
        // Basic content item structure
        const contentItem = {
          name,
          path: relativePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          lastModified: stats.mtime,
          type: stats.isDirectory() ? 'directory' : 'file'
        };
        
        // For markdown files, try to extract title from front matter
        if (!stats.isDirectory() && name.endsWith('.md')) {
          try {
            const content = await fs.readFile(itemPath, 'utf8');
            const titleMatch = content.match(/title:\s*["']?([^"'\n]+)["']?/i);
            if (titleMatch && titleMatch[1]) {
              contentItem.title = titleMatch[1].trim();
            }
          } catch (error) {
            LOG.error(`Error reading file: ${error.message}`, error);
          }
        }
        
        return contentItem;
      }));
      
      // Sort directories first, then files, both alphabetically
      contentItems.sort((a, b) => {
        // Directories first
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        // Then sort by name
        return a.name.localeCompare(b.name);
      });
      
      // Return the structured content
      return this.sendResponse(res, 200, {
        path: contentPath || '/',
        items: contentItems,
        count: contentItems.length
      });
      
    } catch (error) {
      this.handleError(res, error, 'Error listing directory contents');
    }
  }

  /**
   * Send JSON response
   * @private
   */
  sendResponse(res, statusCode, data) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = statusCode;
    res.end(JSON.stringify(data));
  }

  /**
   * Handle errors
   * @private
   */
  handleError(res, error, context = '') {
    LOG.error(`${context} error:`, error);
    this.sendResponse(res, 500, { 
      error: 'Internal Server Error',
      message: error.message,
      ...(context && { context })
    });
  }
}

export default new StructureController();