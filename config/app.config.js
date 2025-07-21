/**
 * Application configuration
 */

export const config = {
  // Accepted file extensions for content files (in order of priority)
  contentExtensions: ['.html', '.md'],
  
  // Default file extension for content files
  defaultContentExtension: '.html',
  
  // Directory names to ignore when scanning for content
  ignoredDirectories: [
    'node_modules',
    '.git',
    '.github',
    '.vscode',
    'dist',
    'build',
    'public',
    'assets',
    'images',
    'styles'
  ],
  
  // Default port for the server
  port: process.env.PORT || 7070,
  
  // Content directory (can be overridden by environment variable)
  contentDir: process.env.CONTENT_DIR
};

export default config;
