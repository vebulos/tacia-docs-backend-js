import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/app.config.js';

// Import CONTENT_DIR from server.js
import { CONTENT_DIR } from '../server.js';

/**
 * Find the first document in the specified directory using configured extensions
 * @param {string} [directory=''] - The directory to search in (relative to CONTENT_DIR)
 * @returns {Promise<{path: string|null, error: string|null}>} The path of the first document or null if none found
 */
export async function findFirstDocument(directory = '') {
  try {
    console.log(`[ContentService] Finding first document in directory: '${directory}'`);
    
    // Normalize the directory path
    const normalizedDir = path.normalize(directory).replace(/\\/g, '/');
    const searchDir = path.join(CONTENT_DIR, normalizedDir);
    
    // Check if the directory exists
    try {
      const dirStats = await fs.stat(searchDir);
      if (!dirStats.isDirectory()) {
        console.error(`[ContentService] Path is not a directory: ${searchDir}`);
        return { path: null, error: 'Path is not a directory' };
      }
    } catch (dirError) {
      console.error(`[ContentService] Directory not found: ${searchDir}`, dirError);
      return { path: null, error: 'Directory not found' };
    }
    
    // Read the directory
    const items = await fs.readdir(searchDir, { withFileTypes: true });
    
    // Filter and sort files by extension priority
    const files = items
      .filter(item => item.isFile() && 
        config.contentExtensions.some(ext => item.name.endsWith(ext)))
      .sort((a, b) => {
        // Sort by extension priority first, then by filename
        const extA = path.extname(a.name);
        const extB = path.extname(b.name);
        const extPriorityA = config.contentExtensions.indexOf(extA);
        const extPriorityB = config.contentExtensions.indexOf(extB);
        
        if (extPriorityA !== extPriorityB) {
          return extPriorityA - extPriorityB;
        }
        return a.name.localeCompare(b.name);
      });
    
    if (files.length > 0) {
      // Return the first matching file
      const relativePath = path.posix.join(normalizedDir, files[0].name).replace(/\\/g, '/');
      console.log(`[ContentService] First document found: ${relativePath}`);
      return { 
        path: relativePath.endsWith(config.defaultContentExtension) 
          ? relativePath.slice(0, -config.defaultContentExtension.length) 
          : relativePath,
        error: null 
      };
    }
    
    // If no files found, search in subdirectories
    const subdirs = items
      .filter(item => item.isDirectory() && 
        !config.ignoredDirectories.includes(item.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    for (const subdir of subdirs) {
      const subdirPath = path.posix.join(normalizedDir, subdir.name);
      const result = await findFirstDocument(subdirPath);
      if (result.path) {
        return result;
      }
    }
    
    // If we reach here, no files were found
    console.log(`[ContentService] No content files found in directory: '${directory}'`);
    return { path: null, error: null };
    
  } catch (error) {
    console.error('[ContentService] Error finding first document:', error);
    return { 
      path: null, 
      error: `Failed to find first document: ${error.message}`,
      details: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    };
  }
}

/**
 * Checks if a document exists at the given path
 * @param {string} documentPath - Path to the document relative to content directory
 * @returns {Promise<boolean>} True if document exists, false otherwise
 */
export async function documentExists(documentPath) {
  try {
    // Normalize the path to prevent directory traversal
    const normalizedPath = path.normalize(documentPath).replace(/^\.\.\//, '');
    const fullPath = path.join(CONTENT_DIR, normalizedPath);
    
    const stats = await fs.stat(fullPath);
    return stats.isFile();
  } catch (error) {
    return false;
  }
}