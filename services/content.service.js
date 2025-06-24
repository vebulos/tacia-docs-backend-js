import fs from 'fs/promises';
import path from 'path';

// Import CONTENT_DIR from server.js
import { CONTENT_DIR } from '../server.js';

/**
 * Find the first markdown document in any content folder
 * @returns {Promise<{path: string|null, error: string|null}>} The path of the first document or null if none found
 */
export async function findFirstDocument() {
  try {
    console.log('[ContentService] Finding first document in content folders');
    
    // Check if content directory exists
    try {
      const contentDirStats = await fs.stat(CONTENT_DIR);
      if (!contentDirStats.isDirectory()) {
        console.error(`[ContentService] Base content directory is not a directory: ${CONTENT_DIR}`);
        return { path: null, error: 'Content directory configuration error' };
      }
    } catch (contentDirError) {
      console.error(`[ContentService] Base content directory not found: ${CONTENT_DIR}`, contentDirError);
      return { path: null, error: 'Content directory not found' };
    }
    
    // Read the content directory to find all folders
    const contentItems = await fs.readdir(CONTENT_DIR, { withFileTypes: true });
    console.log(`[ContentService] Found ${contentItems.length} items in content directory`);
    
    // Filter to only include directories
    const contentFolders = contentItems.filter(item => item.isDirectory());
    
    if (contentFolders.length === 0) {
      console.log('[ContentService] No content folders found');
      return { path: null, error: null };
    }
    
    // Sort folders alphabetically
    contentFolders.sort((a, b) => a.name.localeCompare(b.name));
    
    // Search through each folder until we find a markdown file
    for (const folder of contentFolders) {
      console.log(`[ContentService] Searching for markdown files in folder: ${folder.name}`);
      
      // Read the folder to find markdown files
      const folderPath = path.join(CONTENT_DIR, folder.name);
      const folderItems = await fs.readdir(folderPath, { withFileTypes: true });
      
      // Filter to only include markdown files
      const markdownFiles = folderItems.filter(item => item.isFile() && item.name.endsWith('.md'));
      
      if (markdownFiles.length > 0) {
        // Sort markdown files alphabetically
        markdownFiles.sort((a, b) => a.name.localeCompare(b.name));
        
        // Get the first markdown file
        const firstFile = markdownFiles[0].name;
        
        // Create the relative path with forward slashes
        const relativePath = path.posix.join(folder.name, firstFile).replace(/\\/g, '/');
        
        console.log(`[ContentService] First document found: ${relativePath}`);
        return { path: relativePath, error: null };
      }
      
      console.log(`[ContentService] No markdown files found in folder: ${folder.name}`);
    }
    
    // If we reach here, no markdown files were found in any folder
    console.log('[ContentService] No markdown files found in any content folder');
    return { path: null, error: null };
  } catch (error) {
    console.error('[ContentService] Error finding first document:', error);
    return { 
      path: null, 
      error: 'Failed to find first document: ' + error.message 
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