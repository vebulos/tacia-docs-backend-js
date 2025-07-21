import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import { createLogger } from '../logger.js';
import { config } from '../config/app.config.js';
import yaml from 'yaml';

// Simple YAML frontmatter parser for metadata files
async function parseMetadataFile(content) {
  try {
    return yaml.parse(content);
  } catch (error) {
    // Fallback to simple key-value parsing
    const result = {};
    const lines = content.split('\n');
    
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
        
        result[key] = value;
      }
    }
    
    return result;
  }
}

// Extract frontmatter from markdown content
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return null;
  
  try {
    return yaml.parse(frontmatterMatch[1]);
  } catch (error) {
    return null;
  }
}

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
      const files = await fs.readdir(fullPath, { withFileTypes: true });
      
      // Process each entry
      const items = [];
      for (const entry of files) {
        const entryPath = path.join(fullPath, entry.name);
        const relativePath = path.join(contentPath, entry.name).replace(/\\/g, '/');
        
        // Skip hidden files and directories (except .metadata)
        if (entry.name.startsWith('.') && entry.name !== '.metadata') {
          continue;
        }
        
        // Skip files with unallowed extensions
        if (!entry.isDirectory() && 
            entry.name !== '.metadata' && 
            !config.contentExtensions.includes(path.extname(entry.name).toLowerCase())) {
          continue;
        }
        
        const stats = await fs.stat(entryPath);
        const isDirectory = entry.isDirectory();
        const isMarkdown = entry.name.endsWith('.md');
        
        const item = {
          name: entry.name,
          path: relativePath,
          isDirectory,
          size: stats.size,
          lastModified: stats.mtime.toISOString(),
          type: isDirectory ? 'directory' : 'file',
          metadata: {}
        };
        
        try {
          // Handle .metadata files for directories
          if (isDirectory) {
            const metadataPath = path.join(entryPath, '.metadata');
            try {
              const metadataContent = await fs.readFile(metadataPath, 'utf8');
              const metadata = await parseMetadataFile(metadataContent);
              if (metadata) {
                item.metadata = metadata;
                // Set order from metadata if present
                if (metadata.order !== undefined) {
                  item.order = Number(metadata.order) || 0;
                }
              }
            } catch (error) {
              // .metadata file doesn't exist or couldn't be read, which is fine
              if (error.code !== 'ENOENT') {
                LOG.error(`Error reading .metadata file ${metadataPath}:`, error);
              }
            }
          } 
          // Handle markdown frontmatter
          else if (isMarkdown) {
            try {
              const content = await fs.readFile(entryPath, 'utf8');
              const frontmatter = extractFrontmatter(content);
              if (frontmatter) {
                item.metadata = frontmatter;
                // Set order from frontmatter if present
                if (frontmatter.order !== undefined) {
                  item.order = Number(frontmatter.order) || 0;
                }
              }
            } catch (error) {
              LOG.error(`Error reading markdown file ${entryPath}:`, error);
            }
          }
        } catch (error) {
          LOG.error(`Error processing metadata for ${entryPath}:`, error);
        }
        
        // Skip .metadata files from the final output
        if (entry.name === '.metadata') continue;
        
        items.push(item);
      }
      
      // Sort items
      items.sort((a, b) => {
        // First by order (if specified)
        if (a.order !== undefined || b.order !== undefined) {
          const aOrder = a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
          const bOrder = b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;
          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }
        }
        
        // Then by type (directories first)
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        
        // Finally by name
        return a.name.localeCompare(b.name);
      });
      
      // Log the final order
      LOG.debug('After sort order:');
      items.forEach((item, index) => {
        LOG.debug(`  ${index + 1}. ${item.name} (order: ${item.order !== undefined ? item.order : 'none'})`);
      });
      
      // Debug: log items after sorting
      LOG.debug('Items after sorting:', items.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory,
        order: item.order,
        hasMetadata: !!item.metadata && Object.keys(item.metadata).length > 0
      })));
      
      // Return the structured content
      return this.sendResponse(res, 200, {
        path: contentPath || '/',
        items: items,
        count: items.length
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