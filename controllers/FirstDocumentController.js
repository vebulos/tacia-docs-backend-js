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
  async getFirstDocument(req, res) {
    try {
      LOG.debug('Getting first available document');
      
      // Get the first markdown file in the content directory
      const firstDoc = await this.findFirstMarkdownFile(CONTENT_DIR);
      
      // Set content type
      res.setHeader('Content-Type', 'application/json');
      
      if (!firstDoc) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'No markdown files found in content directory' }));
      }
      
      // Get the relative path from CONTENT_DIR
      const relativePath = path.relative(CONTENT_DIR, firstDoc);
      // Convert Windows paths to forward slashes
      const normalizedPath = relativePath.replace(/\\/g, '/');
      
      LOG.info(`First document found: ${normalizedPath}`);
      
      // Return the path to the first document
      return res.end(JSON.stringify({
        path: normalizedPath,
        fullPath: firstDoc
      }));
    } catch (error) {
      LOG.error('Error getting first document', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ 
        error: 'Failed to get first document', 
        details: error.message 
      }));
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
        return a.isDirectory() ? -1 : 1;
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