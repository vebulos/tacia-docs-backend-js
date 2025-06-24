// Import the RelatedService
import * as RelatedService from '../services/related.service.js';

/**
 * Handler for fetching related documents based on tags and categories.
 * @param {Request} req - HTTP request object
 * @param {Response} res - HTTP response object
 */
export async function getRelatedDocuments(req, res) {
  try {
    // Get document path from query
    const documentPath = req.query?.path || '';
    const limit = parseInt(req.query?.limit || '5', 10);
    const skipCache = req.query?.skipCache === 'true';
    
    console.log(`[related] Getting related documents for path: ${documentPath}, limit: ${limit}, skipCache: ${skipCache}`);
    
    // Use the RelatedService to find related documents
    const result = await RelatedService.findRelatedDocumentsForPath(documentPath, limit, skipCache);
    
    // If there was an error, return appropriate status code
    if (result.error) {
      console.error(`[related] Error from RelatedService: ${result.error}`);
      
      // Set appropriate status code based on the error
      if (result.error === 'Document not found') {
        res.statusCode = 404;
      } else if (result.error === 'Missing document path') {
        res.statusCode = 400;
      } else {
        res.statusCode = 500;
      }
      
      return res.json({
        error: result.error,
        details: result.details,
        related: result.related || []
      });
    }
    
    // Return the related documents
    return res.json({
      related: result.related,
      fromCache: result.fromCache
    });
  } catch (error) {
    console.error('[related] Unexpected error in getRelatedDocuments:', error);
    res.statusCode = 500;
    return res.json({ error: 'Failed to get related documents', details: error.message, related: [] });
  }
}

/**
 * Get cached related documents if available and not expired
 * @param {string} documentPath - Path of the document
 * @param {number} limit - Maximum number of related documents to return
 * @returns {Array|null} Array of related documents or null if not cached
 */
function getCachedRelatedDocs(documentPath, limit) {
  const cacheEntry = relatedDocsCache.get(documentPath);
  
  if (!cacheEntry) {
    return null;
  }
  
  // Check if cache entry has expired
  const now = Date.now();
  if (now - cacheEntry.timestamp > cacheEntry.ttl) {
    console.log(`[related] Cache expired for ${documentPath}`);
    relatedDocsCache.delete(documentPath);
    return null;
  }
  
  // Return cached data limited to requested limit
  return cacheEntry.data.slice(0, limit);
}

/**
 * Cache related documents for a document
 * @param {string} documentPath - Path of the document
 * @param {Array} relatedDocs - Array of related documents
 * @param {number} ttl - Time to live in milliseconds (optional)
 */
function cacheRelatedDocs(documentPath, relatedDocs, ttl = DEFAULT_CACHE_TTL) {
  relatedDocsCache.set(documentPath, {
    timestamp: Date.now(),
    data: relatedDocs,
    ttl: ttl
  });
  
  console.log(`[related] Cached ${relatedDocs.length} documents for ${documentPath}, TTL: ${ttl}ms`);
  
  // Cleanup old cache entries if cache is getting too large
  if (relatedDocsCache.size > 100) {
    cleanupCache();
  }
}

/**
 * Clean up expired cache entries
 */
function cleanupCache() {
  const now = Date.now();
  let expiredCount = 0;
  
  for (const [key, entry] of relatedDocsCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      relatedDocsCache.delete(key);
      expiredCount++;
    }
  }
  
  console.log(`[related] Cache cleanup: removed ${expiredCount} expired entries, remaining: ${relatedDocsCache.size}`);
}

/**
 * Find documents related to the current document based on tags.
 * @param {string} currentPath - Path of the current document
 * @param {string} documentDir - Directory containing the current document (not used for relevance)
 * @param {Object} currentMetadata - Metadata of the current document
 * @param {number} limit - Maximum number of related documents to return
 * @returns {Promise<Array>} Array of related documents
 */
async function findRelatedDocuments(currentPath, documentDir, currentMetadata, limit) {
  try {
    const relatedDocs = [];
    
    // Get all markdown files in the content directory
    const allMarkdownFiles = await getAllMarkdownFiles('.');
    
    // Process each file to check for common tags
    for (const filePath of allMarkdownFiles) {
      // Skip the current document
      const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/\\.md$/i, '');
      const normalizedCurrentPath = currentPath.replace(/\\/g, '/').replace(/\\.md$/i, '');
      
      if (normalizedFilePath === normalizedCurrentPath) {
        console.log(`[related] Skipping current document: ${normalizedFilePath}`);
        continue;
      }
      
      try {
        const fullPath = path.join(CONTENT_DIR, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const { data } = matter(content);
        
        // Skip if no tags in either document
        if (!data.tags || !currentMetadata.tags) {
          continue;
        }
        
        // Extract title from metadata or filename
        let title = data.title;
        if (!title) {
          const basename = path.basename(filePath, '.md');
          title = basename
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
        }
        
        // Calculate common tags and relevance
        const candidateTags = Array.isArray(data.tags) ? data.tags : [data.tags];
        const currentTags = Array.isArray(currentMetadata.tags) ? currentMetadata.tags : [currentMetadata.tags];
        
        const commonTags = candidateTags.filter(tag => currentTags.includes(tag));
        
        // Only include if there are common tags
        if (commonTags.length > 0) {
          const relevance = commonTags.length; // Relevance based on number of common tags
          
          relatedDocs.push({
            path: filePath
              .replace(/\\.md$/i, '') // Remove .md extension
              .replace(/\\/g, '/'),   // Replace backslashes with forward slashes
            title: title,
            commonTags: commonTags,
            commonTagsCount: commonTags.length,
            relevance: relevance
          });
        }
      } catch (error) {
        console.warn(`[related] Error processing file ${filePath}:`, error);
      }
    }
    
    // Sort by relevance (highest first) and limit results
    return relatedDocs
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
      
  } catch (error) {
    console.error('[related] Error finding related documents:', error);
    return [];
  }
}

/**
 * Recursively get all markdown files in a directory
 * @param {string} dir - Directory to search in
 * @returns {Promise<Array<string>>} Array of relative file paths
 */
async function getAllMarkdownFiles(dir) {
  const results = [];
  const items = await fs.readdir(path.join(CONTENT_DIR, dir), { withFileTypes: true });
  
  for (const item of items) {
    // Use path.posix.join to ensure forward slashes are used
    const relativePath = path.posix.join(
      dir.replace(/\\/g, '/'), 
      item.name
    );
    
    if (item.isDirectory()) {
      // Recursively get files in subdirectories
      const subDirFiles = await getAllMarkdownFiles(relativePath);
      results.push(...subDirFiles);
    } else if (item.isFile() && item.name.endsWith('.md')) {
      // Add markdown files with forward slashes
      results.push(relativePath.replace(/\\/g, '/'));
    }
  }
  
  return results;
}