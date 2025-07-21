import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import * as ContentService from '../services/content.service.js';
import { createLogger } from '../logger.js';

const LOG = createLogger('ContentController');

// Simple YAML parser for frontmatter
function parseYamlFrontmatter(yamlContent) {
  const result = {};
  const lines = yamlContent.split('\n');
  
  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      
      // Try to parse values appropriately
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null' || value === '') value = null;
      else if (!isNaN(value) && value !== '') value = Number(value);
      else if (value.startsWith('[') && value.endsWith(']')) {
        // Simple array parsing
        value = value.substring(1, value.length - 1)
          .split(',')
          .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
          .filter(item => item.length > 0);
      }
      
      result[key] = value;
    }
  }
  
  return result;
}

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
      
      // Default metadata with just the title from filename
      const metadata = {
        title: title
      };
      
      // Try to extract frontmatter if present
      const frontmatterMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---/);
      let contentWithoutFrontmatter = fileContent;
      
      if (frontmatterMatch) {
        const yamlContent = frontmatterMatch[1];
        contentWithoutFrontmatter = fileContent.substring(frontmatterMatch[0].length).trim();
        
        try {
          // First try with the YAML parser if available
          try {
            const yaml = await import('yaml');
            const parsedYaml = yaml.parse(yamlContent);
            if (parsedYaml && typeof parsedYaml === 'object') {
              Object.assign(metadata, parsedYaml);
            }
          } catch (yamlError) {
            LOG.debug('Falling back to simple YAML parser');
            // Fallback to simple parser if YAML parsing fails
            const parsedYaml = parseYamlFrontmatter(yamlContent);
            Object.assign(metadata, parsedYaml);
          }
          
          // Ensure title is always a string (fallback to filename)
          if (!metadata.title || typeof metadata.title !== 'string') {
            metadata.title = title;
          }
          
          // Convert tags to array if it's a string
          if (metadata.tags) {
            if (typeof metadata.tags === 'string') {
              metadata.tags = metadata.tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);
            } else if (!Array.isArray(metadata.tags)) {
              // If tags is not an array, remove it
              delete metadata.tags;
            }
          }
          
          LOG.debug(`Extracted metadata: ${JSON.stringify(metadata)}`);
          
        } catch (error) {
          LOG.error('Error parsing frontmatter:', error);
          // Continue with default metadata if parsing fails
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
