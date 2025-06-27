import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import MarkdownService from '../services/markdown.service.js';
import * as ContentService from '../services/content.service.js';

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
      const hasExtension = path.extname(contentPath) !== '';
      
      if (hasExtension) {
        // file 
        return this.handleContentRequest(res, contentPath, req.query || {});
      } else {
        // No extension - directory structure
        return this.handleContentStructure(res, contentPath, req.query || {});
      }
    } catch (error) {
      this.handleError(res, error, 'Error handling request');
    }
  }

  /**
   * Handle directory structure requests (directories)
   * @private
   */
  async handleContentRequest(res, contentPath, queryParams) {
    try {
      console.log(`[StructureController] Handling content request for: ${contentPath}`);
      
      // Normalize and secure the path
      let safePath = path.normalize(contentPath)
        .replace(/^([/\\])+/, '')
        .replace(/[/\\]+\.\.\//g, '/')
        .replace(/[/\\]+/g, '/');
      
      const fullPath = path.join(CONTENT_DIR, safePath);
      
      // Security check to prevent path traversal attacks
      if (!fullPath.startsWith(CONTENT_DIR)) {
        console.warn(`[StructureController] Security warning: Attempted path traversal: ${contentPath}`);
        return this.sendResponse(res, 400, { 
          error: 'Invalid path', 
          details: 'Path traversal not allowed' 
        });
      }
      
      console.log(`[StructureController] Reading file from: ${fullPath}`);
      
      // Read the file content
      const fileContent = await fs.readFile(fullPath, 'utf8');
      
      // Parse markdown if it's a markdown file
      if (path.extname(fullPath).toLowerCase() === '.md') {
        const parsedContent = MarkdownService.parseMarkdownFile(fileContent);
        return this.sendResponse(res, 200, parsedContent);
      } 
      // For other file types, return raw content
      else {
        return this.sendResponse(res, 200, {
          content: fileContent,
          type: 'file',
          path: contentPath
        });
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return this.sendResponse(res, 404, { 
          error: 'Not Found',
          message: 'The requested content was not found',
          path: contentPath
        });
      }
      this.handleError(res, error, 'Error handling content request');
    }
  }

  /**
   * Handle content structure requests (directories)
   * @private
   */
  async handleContentStructure(res, contentPath, queryParams) {
    try {
      console.log(`[StructureController] Handling structure request for: ${contentPath || 'root'}`);
      
      // Normalize and secure the path
      const safePath = path.normalize(contentPath || '')
        .replace(/^(\/\.\.|\/\.|\\.\.|\\.)+/g, '')  // Prevent directory traversal
        .replace(/^[/\\]+/, '')  // Remove leading slashes
        .replace(/[/\\]+/g, '/'); // Normalize path separators
      
      // Determine the full path to the directory
      const fullPath = path.join(CONTENT_DIR, safePath);
      
      // Check if the content directory exists
      // TODO this must be checked in the router once at startup, not by every request
      try {
        // First check if the base content directory exists
        const contentDirStats = await fs.stat(CONTENT_DIR);
        if (!contentDirStats.isDirectory()) {
          console.error(`[StructureController] Base content directory is not a directory: ${CONTENT_DIR}`);
          return this.sendResponse(res, 500, { 
            error: 'Content directory configuration error' 
          });
        }
        
        // Now check the requested path
        console.log(`[ContentController] Checking path: ${fullPath}`);
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) {
          console.warn(`[ContentController] Path is not a directory: ${fullPath}`);
          return this.sendResponse(res, 400, { 
            error: 'Path is not a directory',
            path: contentPath
          });
        }
      } catch (error) {
        console.warn(`[StructureController] Directory not found: ${fullPath}`, error);
        return this.sendResponse(res, 404, { 
          error: 'Directory not found',
          path: contentPath,
          details: error.message 
        });
      }
      
      // Read the directory contents
      console.log(`[StructureController] Reading directory: ${fullPath}`);
      const files = await fs.readdir(fullPath);
      console.log(`[StructureController] Found ${files.length} files/directories`);
      
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
            console.error(`[StructureController] Error reading file ${name}:`, error);
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
      this.handleError(res, error, 'Error handling content structure');
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
    console.error(`[StructureController] ${context} error:`, error);
    this.sendResponse(res, 500, { 
      error: 'Internal Server Error',
      message: error.message,
      ...(context && { context })
    });
  }
}

export default new StructureController();
