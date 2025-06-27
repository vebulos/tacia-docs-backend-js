import * as RelatedService from '../services/related.service.js';
import { createLogger } from '../logger.js';

const LOG = createLogger('RelatedController');

/**
 * Controller for handling related documents functionality
 */
class RelatedController {
  /**
   * Get related documents for a given document path
   * @param {Request} req - HTTP request object
   * @param {Response} res - HTTP response object
   */
  async getRelatedDocuments(req, res) {
    try {
      // Get document path from query
      const documentPath = req.query?.path || '';
      const limit = parseInt(req.query?.limit || '5', 10);
      const skipCache = req.query?.skipCache === 'true';
      
      LOG.debug(`Getting related documents for path: ${documentPath}, limit: ${limit}, skipCache: ${skipCache}`);
      
      // Use the RelatedService to find related documents
      const result = await RelatedService.findRelatedDocumentsForPath(documentPath, limit, skipCache);
      
      // Set content type
      res.setHeader('Content-Type', 'application/json');
      
      // If there was an error, return appropriate status code
      if (result.error) {
        LOG.error(`Error from RelatedService: ${result.error}`);
        
        // Set appropriate status code based on the error
        if (result.error === 'Document not found') {
          res.statusCode = 404;
        } else if (result.error === 'Missing document path') {
          res.statusCode = 400;
        } else {
          res.statusCode = 500;
        }
        
        return res.end(JSON.stringify({
          error: result.error,
          details: result.details,
          related: result.related || []
        }));
      }
      
      // Return the related documents
      return res.end(JSON.stringify({
        related: result.related,
        fromCache: result.fromCache
      }));
    } catch (error) {
      LOG.error('Unexpected error in getRelatedDocuments', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ 
        error: 'Failed to get related documents', 
        details: error.message, 
        related: [] 
      }));
    }
  }
}

export default new RelatedController();