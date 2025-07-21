import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import { createLogger } from '../logger.js';
import { config } from '../config/app.config.js';

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
      const contentItems = [];
      
      for (const name of files) {
        const itemPath = path.join(fullPath, name);
        const stats = await fs.stat(itemPath);
        
        // Skip files with unallowed extensions
        if (!stats.isDirectory()) {
          const ext = path.extname(name).toLowerCase();
          if (!config.contentExtensions.includes(ext)) {
            continue; // Skip this file
          }
        }
        
        // Determine the relative path for the item
        const relativePath = path.join(contentPath, name).replace(/\\/g, '/');
        
        // Basic content item structure
        const contentItem = {
          name: name,
          path: relativePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          lastModified: stats.mtime,
          type: stats.isDirectory() ? 'directory' : 'file',
          order: undefined,  // No order by default
          metadata: {}
        };
        
        // For directories, check if .metadata file exists
        if (stats.isDirectory()) {
          try {
            const metadataPath = path.join(itemPath, '.metadata');
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            
            // Extract order from metadata
            const orderMatch = metadataContent.match(/order\s*:\s*(\d+)/i);
            if (orderMatch && orderMatch[1]) {
              contentItem.order = parseInt(orderMatch[1], 10);
            }
            
            // Store raw metadata for future use
            contentItem.metadata = metadataContent;
          } catch (error) {
            // .metadata file doesn't exist or couldn't be read, which is fine
            if (error.code !== 'ENOENT') {
              LOG.error(`Error reading .metadata file in ${itemPath}:`, error);
            }
          }
        }
        // For markdown files, try to extract metadata from front matter
        else if (name.endsWith('.md')) {
          try {
            const content = await fs.readFile(itemPath, 'utf8');
            // Extract title
            const titleMatch = content.match(/title:\s*["']?([^"'\n]+)["']?/i);
            if (titleMatch && titleMatch[1]) {
              contentItem.title = titleMatch[1].trim();
            }
            // Extract order from front matter if present
            // First try YAML front matter format (--- order: 123 ---)
            const frontMatterMatch = content.match(/^---[\s\S]*?order:\s*(\d+)[\s\S]*?---/);
            if (frontMatterMatch && frontMatterMatch[1]) {
              contentItem.order = parseInt(frontMatterMatch[1], 10);
              LOG.debug(`Found order ${contentItem.order} in ${name} (YAML front matter)`);
            } else {
              // Fallback to simple format (order: 123)
              const orderMatch = content.match(/^order:\s*(\d+)/m);
              if (orderMatch && orderMatch[1]) {
                contentItem.order = parseInt(orderMatch[1], 10);
                LOG.debug(`Found order ${contentItem.order} in ${name} (simple format)`);
              }
            }
          } catch (error) {
            LOG.error(`Error reading file: ${error.message}`, error);
          }
        }
        
        contentItems.push(contentItem);
      }
      
      // Debug: log items before sorting
      LOG.debug('Items before sorting:', contentItems.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory,
        order: item.order,
        hasMetadata: !!item.metadata && Object.keys(item.metadata).length > 0
      })));
      
      // Log the order values for debugging
      contentItems.forEach(item => {
        LOG.debug(`Before sort - Item: ${item.name}, Order: ${item.order !== undefined ? item.order : 'undefined'}, Type: ${item.isDirectory ? 'directory' : 'file'}`);
      });

      // Sort items with order first (by order value), then items without order (by name)
      contentItems.sort((a, b) => {
        // If both have order, sort by order value
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        // If only a has order, a comes first
        if (a.order !== undefined) return -1;
        // If only b has order, b comes first
        if (b.order !== undefined) return 1;
        // If neither has order, sort by name
        return a.name.localeCompare(b.name);
      });
      
      // Log the final order
      LOG.debug('After sort order:');
      contentItems.forEach((item, index) => {
        LOG.debug(`  ${index + 1}. ${item.name} (order: ${item.order !== undefined ? item.order : 'none'})`);
      });
      
      // Debug: log items after sorting
      LOG.debug('Items after sorting:', contentItems.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory,
        order: item.order,
        hasMetadata: !!item.metadata
      })));
      
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