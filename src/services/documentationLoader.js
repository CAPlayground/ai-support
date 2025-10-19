import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

export class DocumentationLoader {
  constructor(documentationPath) {
    this.documentationPath = documentationPath;
    this.documents = [];
  }

  async loadDocumentation() {
    try {
      Logger.info('Loading documentation files...');
      this.documents = [];

      const files = await this.getDocumentationFiles(this.documentationPath);
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const relativePath = path.relative(this.documentationPath, file);
          
          this.documents.push({
            path: relativePath,
            content: this.cleanMDXContent(content),
            fullPath: file,
          });
          
          Logger.info(`Loaded: ${relativePath}`);
        } catch (error) {
          Logger.error(`Failed to load ${file}:`, error.message);
        }
      }

      Logger.info(`Successfully loaded ${this.documents.length} documentation files`);
      return this.documents;
    } catch (error) {
      Logger.error('Error loading documentation:', error);
      return [];
    }
  }

  async getDocumentationFiles(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getDocumentationFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && (entry.name.endsWith('.mdx') || entry.name.endsWith('.md'))) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      Logger.warn(`Could not read directory ${dir}:`, error.message);
    }
    
    return files;
  }

  cleanMDXContent(content) {
    let cleaned = content.replace(/^import\s+.*$/gm, '');
    cleaned = cleaned.replace(/^export\s+.*$/gm, '');
    
    cleaned = cleaned.replace(/<([A-Z][A-Za-z0-9]*)[^>]*>/g, '');
    cleaned = cleaned.replace(/<\/[A-Z][A-Za-z0-9]*>/g, '');
    
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    return cleaned.trim();
  }

  getDocumentationContext() {
    if (this.documents.length === 0) {
      return 'No documentation loaded yet.';
    }

    return this.documents
      .map(doc => `=== ${doc.path} ===\n${doc.content}`)
      .join('\n\n');
  }

  getDocumentationSummary() {
    return {
      totalFiles: this.documents.length,
      files: this.documents.map(doc => doc.path),
    };
  }
}
