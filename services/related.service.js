import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { CONTENT_DIR } from '../server.js';
import { createLogger } from '../logger.js';

const LOG = createLogger('RelatedService');

// Simple in-memory cache for related documents
// Structure: { [documentPath]: { timestamp: Date, data: Array<RelatedDoc>, ttl: number } }
const relatedDocsCache = new Map();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Find documents related to the current document based on tags.
 * @param {string} documentPath - Path of the document to find related documents for
 * @param {number} limit - Maximum number of related documents to return
 * @param {boolean} skipCache - Whether to skip the cache
 * @returns {Promise<{related: Array, fromCache: boolean, error?: string, details?: string}>} Object containing related documents and metadata
 */
export async function findRelatedDocumentsForPath(documentPath, limit = 5, skipCache = false) {
  try {
    LOG.debug(`Getting related documents for path: ${documentPath}, limit: ${limit}, skipCache: ${skipCache}`);
    
    if (!documentPath) {
      LOG.warn('Missing document path');
      return { 
        error: 'Missing document path', 
        details: 'The path parameter is required',
        related: [] 
      };
    }
    
    // Normalize the path to ensure consistent handling
    // Replace backslashes, remove leading/trailing slashes, and ensure .md extension
    let normalizedPath = documentPath
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    
    if (!normalizedPath.endsWith('.md')) {
      normalizedPath = `${normalizedPath}.md`;
    }
    
    LOG.debug(`Normalized document path: ${normalizedPath}`);
    
    // Check cache first if not skipping
    if (!skipCache) {
      const cachedResult = getCachedRelatedDocs(normalizedPath, limit);
      if (cachedResult) {
        LOG.debug(`Cache hit for ${normalizedPath}`);
        return {
          related: cachedResult,
          fromCache: true
        };
      }
    }
    
    // Get the directory containing the current document
    const documentDir = path.dirname(normalizedPath);
    const fullDocumentPath = path.join(CONTENT_DIR, normalizedPath);
    
    try {
      // Check if the document exists
      await fs.access(fullDocumentPath);
    } catch (error) {
      LOG.warn(`Document not found: ${fullDocumentPath}`);
      return { 
        error: 'Document not found', 
        details: `The document at path '${normalizedPath}' does not exist`,
        related: [] 
      };
    }
    
    // Get metadata from the current document
    let currentDocMetadata = {};
    try {
      const content = await fs.readFile(fullDocumentPath, 'utf-8');
      const { data } = matter(content);
      currentDocMetadata = data || {};
    } catch (error) {
      LOG.warn(`Error reading current document metadata: ${error.message}`);
    }
    
    // Find related documents
    const relatedDocs = await findRelatedDocuments(
      normalizedPath,
      documentDir,
      currentDocMetadata,
      limit
    );
    
    LOG.info(`Found ${relatedDocs.length} related documents`);
    
    // Cache the results
    cacheRelatedDocs(normalizedPath, relatedDocs);
    
    return {
      related: relatedDocs,
      fromCache: false
    };
  } catch (error) {
    LOG.error('Error getting related documents:', error);
    return { 
      error: 'Failed to get related documents', 
      details: error.message, 
      related: [] 
    };
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
    LOG.debug(`Cache expired for ${documentPath}`);
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
  
  LOG.debug(`Cached ${relatedDocs.length} documents for ${documentPath}, TTL: ${ttl}ms`);
  
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
  
  LOG.debug(`Cache cleanup: removed ${expiredCount} expired entries, remaining: ${relatedDocsCache.size}`);
}

/**
 * Find documents related to the current document based on path similarity.
 * This is a simplified version that doesn't use front-matter.
 * @param {string} currentPath - Path of the current document
 * @param {string} documentDir - Directory containing the current document
 * @param {Object} currentMetadata - Metadata of the current document (unused in this implementation)
 * @param {number} limit - Maximum number of related documents to return
 * @returns {Promise<Array>} Array of related documents
 */
async function findRelatedDocuments(currentPath, documentDir, currentMetadata, limit) {
  try {
    const relatedDocs = [];
    
    // Get all markdown files in the same directory
    const allMarkdownFiles = await getAllMarkdownFiles(documentDir || '.');
    
    // Get the current document's directory for path-based relevance
    const currentDir = path.dirname(currentPath);
    
    // Process each file to check for path similarity
    for (const filePath of allMarkdownFiles) {
      // Skip the current document
      const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/\.md$/i, '');
      const normalizedCurrentPath = currentPath.replace(/\\/g, '/').replace(/\.md$/i, '');
      
      if (normalizedFilePath === normalizedCurrentPath) {
        LOG.debug(`Skipping current document: ${normalizedFilePath}`);
        continue;
      }
      
      try {
        const fileDir = path.dirname(filePath);
        
        // Calculate relevance based on directory depth similarity
        // Files in the same directory are more relevant
        const relevance = currentDir === fileDir ? 2 : 1;
        
        // Extract title from filename
        const basename = path.basename(filePath, '.md');
        const title = basename
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        
        relatedDocs.push({
          path: normalizedFilePath,
          title: title,
          relevance: relevance
        });
      } catch (error) {
        LOG.warn(`Error processing file ${filePath}:`, error);
      }
    }
    
    // Sort by relevance (highest first) and limit results
    return relatedDocs
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
      
  } catch (error) {
    LOG.error('Error finding related documents:', error);
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