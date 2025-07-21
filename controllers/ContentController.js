import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import * as ContentService from '../services/content.service.js';
import { createLogger } from '../logger.js';

const LOG = createLogger('ContentController');

/**
 * Controller for handling content-related requests
 */
class ContentController {
  /**
   * Handle content requests (files only)
   * @param {http.IncomingMessage} req - HTTP request object
   * @param {http.ServerResponse} res - HTTP response object
   */
  async handleRequest(req, res) {
    try {
      // the path is already extracted by the router
      const contentPath = req.params.path || '';
      const hasExtension = path.extname(contentPath) !== '';
      
      if (!hasExtension) {
        // If no extension, this should be handled by StructureController
        return this.sendResponse(res, 404, {
          error: 'Not Found',
          message: 'Use /api/structure/ for directory listings',
          path: contentPath
        });
      }
      
      // Handle file requests
      return this.handleContentRequest(res, contentPath, req.query || {});
      
    } catch (error) {
      this.handleError(res, error, 'Error handling request');
    }
  }

  /**
   * Handle content requests (files with extensions)
   * @private
   */
  async handleContentRequest(res, contentPath, queryParams) {
    try {
      LOG.debug(`Handling content request for: ${contentPath}`);
      
      // Normalize and secure the path
      let safePath = path.normalize(contentPath)
        .replace(/^([/\\])+/, '')
        .replace(/[/\\]+\.\.\//g, '/')
        .replace(/[/\\]+/g, '/');
      
      const fullPath = path.join(CONTENT_DIR, safePath);
      
      // Security check to prevent path traversal attacks
      if (!fullPath.startsWith(CONTENT_DIR)) {
        LOG.warn(`Security warning: Attempted path traversal: ${contentPath}`);
        return this.sendResponse(res, 400, { 
          error: 'Invalid path', 
          details: 'Path traversal not allowed' 
        });
      }
      
      LOG.debug(`Reading file from: ${fullPath}`);
      
      // Read the file content
      const fileContent = await fs.readFile(fullPath, 'utf8');
      
      // Extract filename without extension for title
      const filename = path.basename(contentPath, path.extname(contentPath));
      // Keep dashes in the filename, only replace underscores with spaces
      let title = filename
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      
      // Default metadata
      const metadata = {
        title: title,
        tags: []
      };
      
      // Try to extract frontmatter if present
      const frontmatterMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
      let contentWithoutFrontmatter = fileContent;
      
      if (frontmatterMatch) {
        const yamlContent = frontmatterMatch[1];
        contentWithoutFrontmatter = fileContent.substring(frontmatterMatch[0].length).trim();
        
        // Extract title from frontmatter if present
        const titleMatch = yamlContent.match(/^title:\s*(.+)$/m);
        if (titleMatch) {
          metadata.title = titleMatch[1].trim();
        }
        
        // Extract tags from frontmatter if present
        const tagsMatch = yamlContent.match(/^tags:\s*\[([^\]]*)\]/m);
        if (tagsMatch) {
          metadata.tags = tagsMatch[1]
            .split(',')
            .map(tag => tag.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        }
      }
      
      // Return structured response expected by frontend
      return this.sendResponse(res, 200, {
        markdown: contentWithoutFrontmatter, // Content without frontmatter (Markdown format)
        metadata: metadata,
        headings: [], // Headers will be extracted client-side
        path: contentPath,
        name: filename
      });
      
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
   * List contents of a directory
   * @private
   */
  async listDirectoryContents() {
    // This method has been moved to StructureController
    throw new Error('listDirectoryContents has been moved to StructureController');
  }
  
  /**
   * Handle content structure requests (directories)
   * @private
   */
  async handleContentStructure(res, contentPath, queryParams) {
    // This method is now handled by StructureController
    return this.sendResponse(res, 404, { 
      error: 'Not Found',
      message: 'Use /api/structure/ for directory listings',
      path: contentPath
    });
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

export default new ContentController();
