import path from 'path';
import fs from 'fs/promises';
import { CONTENT_DIR } from '../server.js';
import { createLogger } from '../logger.js';

const LOG = createLogger('FirstDocumentController');

/**
 * Controller for handling the first document retrieval
 */
class FirstDocumentController {
  /**
   * Get the first available document in the content directory
   * @param {Request} req - HTTP request object
   * @param {Response} res - HTTP response object
   */
  /**
   * Send a JSON response
   * @private
   */
  sendResponse(res, statusCode, data) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
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

  async getFirstDocument(req, res) {
    try {
      LOG.debug('Getting first available document');
      
      // Get the directory from path parameter or use root
      const directory = req.params.path || '';
      const searchDir = directory ? path.join(CONTENT_DIR, directory) : CONTENT_DIR;
      
      LOG.debug(`Searching first document in directory: ${searchDir}`);
      
      // Get the first markdown file in the specified directory
      const firstDoc = await this.findFirstMarkdownFile(searchDir);
      
      if (!firstDoc) {
        this.sendResponse(res, 404, { 
          error: 'Not Found',
          message: `No markdown files found in directory: ${directory || 'root'}`
        });
        return;
      }
      
      // Get the relative path from CONTENT_DIR
      const relativePath = path.relative(CONTENT_DIR, firstDoc);
      // Convert Windows paths to forward slashes
      const normalizedPath = relativePath.replace(/\\/g, '/');
      
      LOG.info(`First document found in ${directory || 'root'}: ${normalizedPath}`);
      
      // Return the path to the first document
      this.sendResponse(res, 200, {
        path: normalizedPath,
        fullPath: firstDoc
      });
      return;
      
    } catch (error) {
      this.handleError(res, error, 'Error getting first document');
      return;
    }
  }
  
  /**
   * Recursively find the first markdown file in a directory
   * @private
   * @param {string} dir - Directory to search in
   * @returns {Promise<string|null>} Path to the first markdown file or null if none found
   */
  async findFirstMarkdownFile(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      // Sort entries to ensure consistent order (directories first, then files)
      entries.sort((a, b) => {
        if (a.isDirectory() === b.isDirectory()) {
          return a.name.localeCompare(b.name);
        }
        return a.isDirectory() ? 1 : -1;
      });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip hidden directories
          if (entry.name.startsWith('.')) continue;
          
          const result = await this.findFirstMarkdownFile(fullPath);
          if (result) return result;
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
          return fullPath;
        }
      }
      
      return null;
    } catch (error) {
      LOG.error(`Error reading directory ${dir}:`, error);
      throw error;
    }
  }
}

export default new FirstDocumentController();