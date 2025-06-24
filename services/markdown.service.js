/**
 * MarkdownService - provides markdown parsing, front matter extraction, and heading extraction.
 */
import { marked } from 'marked';
import hljs from 'highlight.js';
import { JSDOM } from 'jsdom';

// Configure marked with highlight.js for syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  langPrefix: 'hljs language-',
  gfm: true,
  breaks: true,
  silent: true
});

export default class MarkdownService {
  /**
   * Extract YAML front matter and markdown content from a file.
   * @param {string} content - Raw markdown file content
   * @returns {{ metadata: object, markdown: string }}
   */
  static extractFrontMatter(content) {
    const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!frontMatterMatch) {
      return { metadata: {}, markdown: content };
    }
    const yamlContent = frontMatterMatch[1];
    const markdown = frontMatterMatch[2];
    const metadata = {};
    yamlContent.split('\n').forEach(line => {
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        // Handle array values
        if (value.startsWith('[') && value.endsWith(']')) {
          metadata[key.trim()] = value
            .slice(1, -1)
            .split(',')
            .map(item => item.trim().replace(/^['"]|['"]$/g, ''));
        } else {
          metadata[key.trim()] = value.replace(/^['"]|['"]$/g, '');
        }
      }
    });
    return { metadata, markdown };
  }

  /**
   * Parse markdown to HTML.
   * @param {string} markdown - Markdown content
   * @returns {string} - HTML content
   */
  static markdownToHtml(markdown) {
    return marked.parse(markdown);
  }

  /**
   * Create a URL-friendly ID from text (matching client-side implementation)
   * @param {string} text - Text to convert to ID
   * @returns {string} - Generated ID
   */
  static createId(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Map for special characters
    const umlautMap = {
      'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 'ss',
      'Ä': 'A', 'Ö': 'O', 'Ü': 'U',
      'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
      'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
      'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
      'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ø': 'o',
      'ù': 'u', 'ú': 'u', 'û': 'u',
      'ý': 'y', 'ÿ': 'y',
      'ñ': 'n', 'ç': 'c', 'æ': 'ae', 'œ': 'oe'
    };
    
    // Create a regex pattern for all keys in the map
    const umlautRegex = new RegExp(`[${Object.keys(umlautMap).join('')}]`, 'g');
    
    // Process the text to create an ID
    let id = text
      // Replace umlauts and accents
      .replace(umlautRegex, match => umlautMap[match] || match)
      // Convert to lowercase
      .toLowerCase()
      // Replace special characters with hyphen
      .replace(/[^\w\s-]/g, '-')
      // Replace spaces with single hyphen
      .replace(/\s+/g, '-')
      // Replace multiple hyphens with single hyphen
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
      // Truncate to 50 chars to avoid very long URLs
      .substring(0, 50)
      // Remove any trailing hyphen
      .replace(/-+$/, '');
    
    // Ensure ID is not empty
    if (!id) {
      id = 'section';
    }
    
    return id;
  }

  /**
   * Extract headings from HTML content.
   * @param {string} html - HTML content
   * @returns {Array<{ text: string, level: number, id: string }>} - Array of heading objects
   */
  static extractHeadings(html) {
    const dom = new JSDOM(html);
    const headings = Array.from(dom.window.document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const headingIds = new Map();
    
    return headings.map(h => {
      const text = h.textContent || '';
      let id = h.id || this.createId(text);
      
      // Handle duplicate IDs by appending a number
      if (id) {
        const count = (headingIds.get(id) || 0) + 1;
        headingIds.set(id, count);
        
        if (count > 1) {
          id = `${id}-${count}`;
        }
        
        // Set the ID on the heading element
        h.id = id;
      }
      
      return {
        text: text,
        level: parseInt(h.tagName.substring(1)),
        id: id
      };
    });
  }

  /**
   * Parse a markdown file: extract metadata, convert to HTML, and extract headings.
   * @param {string} fileContent - Raw markdown file content
   * @returns {{ html: string, metadata: object, headings: Array }}
   */
  static parseMarkdownFile(fileContent) {
    const { metadata, markdown } = this.extractFrontMatter(fileContent);
    const html = this.markdownToHtml(markdown);
    const headings = this.extractHeadings(html);
    return { html, metadata, headings };
  }
}
