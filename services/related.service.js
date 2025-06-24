import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

// Import CONTENT_DIR from server.js
import { CONTENT_DIR } from '../server.js';

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
    console.log(`[RelatedService] Getting related documents for path: ${documentPath}, limit: ${limit}, skipCache: ${skipCache}`);
    
    if (!documentPath) {
      console.warn('[RelatedService] Missing document path');
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
    
    console.log(`[RelatedService] Normalized document path: ${normalizedPath}`);
    
    // Check cache first if not skipping
    if (!skipCache) {
      const cachedResult = getCachedRelatedDocs(normalizedPath, limit);
      if (cachedResult) {
        console.log(`[RelatedService] Cache hit for ${normalizedPath}`);
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
      console.warn(`[RelatedService] Document not found: ${fullDocumentPath}`);
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
      console.warn(`[RelatedService] Error reading current document metadata: ${error.message}`);
    }
    
    // Find related documents
    const relatedDocs = await findRelatedDocuments(
      normalizedPath,
      documentDir,
      currentDocMetadata,
      limit
    );
    
    console.log(`[RelatedService] Found ${relatedDocs.length} related documents`);
    
    // Cache the results
    cacheRelatedDocs(normalizedPath, relatedDocs);
    
    return {
      related: relatedDocs,
      fromCache: false
    };
  } catch (error) {
    console.error('[RelatedService] Error getting related documents:', error);
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
    console.log(`[RelatedService] Cache expired for ${documentPath}`);
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
  
  console.log(`[RelatedService] Cached ${relatedDocs.length} documents for ${documentPath}, TTL: ${ttl}ms`);
  
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
  
  console.log(`[RelatedService] Cache cleanup: removed ${expiredCount} expired entries, remaining: ${relatedDocsCache.size}`);
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
      const normalizedFilePath = filePath.replace(/\\/g, '/').replace(/\.md$/i, '');
      const normalizedCurrentPath = currentPath.replace(/\\/g, '/').replace(/\.md$/i, '');
      
      if (normalizedFilePath === normalizedCurrentPath) {
        console.log(`[RelatedService] Skipping current document: ${normalizedFilePath}`);
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
              .replace(/\.md$/i, '') // Remove .md extension
              .replace(/\\/g, '/'),   // Replace backslashes with forward slashes
            title: title,
            commonTags: commonTags,
            commonTagsCount: commonTags.length,
            relevance: relevance
          });
        }
      } catch (error) {
        console.warn(`[RelatedService] Error processing file ${filePath}:`, error);
      }
    }
    
    // Sort by relevance (highest first) and limit results
    return relatedDocs
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
      
  } catch (error) {
    console.error('[RelatedService] Error finding related documents:', error);
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