import * as fs from 'fs';
import * as path from 'path';
import { taxonomy } from './taxonomy';

// Flat list of all valid tags across all categories
const ALL_VALID_TAGS = taxonomy.flatMap(cat => cat.tags);

// Regexes
const imageTagsRegex = /(<img\b[^>]*>)|!\[.*?\]\((.*?)\)/g;
const imageTagsAndMarkdownRegex = /!\[.*?\]\((.*?)\)|<img\b[^>]*src=(?:"([^"]*)"|'([^']*)')/g;
const socialMediaRegex = /(https?:\/\/(?:www\.)?(facebook|x\.com|twitter|linkedin|instagram|youtube)\.com\/[^\s]+)/g;
const imageNameRegex = /^(?:[a-z0-9_\-]+?)(?:_(\d{2,4})dpi)?\.(png|jpe?g|gif|mp4)$/i;

function attributeRegex(attribute: string) {
  return new RegExp(`${attribute}=(?:"([^"]*)"|'([^']*)')`);
}

const srcAttributeRegex = attributeRegex('src');
const altAttributeRegex = attributeRegex('alt');
const widthAttributeRegex = attributeRegex('width');
const heightAttributeRegex = attributeRegex('height');
const decodingAttributeRegex = attributeRegex('decoding');
const loadingAttributeRegex = attributeRegex('loading');

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
}

function findLineNumber(content: string, searchStr: string): number {
  const index = content.indexOf(searchStr);
  if (index === -1) return 0;
  return content.substring(0, index).split('\n').length - 1;
}

function parseFrontMatter(content: string): Record<string, any> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const attrs: Record<string, any> = {};
  const yaml = match[1];

  // title
  const titleMatch = yaml.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  if (titleMatch) attrs.title = titleMatch[1];

  // authors
  const authorsMatch = yaml.match(/^authors:\s*\[([^\]]*)\]/m);
  if (authorsMatch) attrs.authors = authorsMatch[1].split(',').map(s => s.trim());

  // description
  const descMatch = yaml.match(/^description:\s*["']?(.+?)["']?\s*$/m);
  if (descMatch) attrs.description = descMatch[1];

  // tags - handle both single line and multiline
  const tagsInlineMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m);
  const tagsMultilineMatch = yaml.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (tagsInlineMatch) {
    attrs.tags = tagsInlineMatch[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  } else if (tagsMultilineMatch) {
    attrs.tags = tagsMultilineMatch[1].match(/-\s+(.+)/g)?.map(s => s.replace(/^-\s+/, '').trim()) || [];
  }

  // image
  const imageMatch = yaml.match(/^image:\s*(.+?)\s*$/m);
  if (imageMatch) attrs.image = imageMatch[1];

  return attrs;
}

// 1. Check tags are valid
function checkMetaBlock(content: string, issues: ValidationIssue[]) {
  const attrs = parseFrontMatter(content);
  if (!attrs) {
    issues.push({ severity: 'error', message: 'No front matter block found', line: 0 });
    return;
  }
  if (!attrs.tags || attrs.tags.length === 0) {
    issues.push({ severity: 'error', message: 'Front matter does not contain tags', line: 0 });
    return;
  }

  const invalidTags = attrs.tags.filter((tag: string) =>
    !ALL_VALID_TAGS.some(valid => valid.toLowerCase() === tag.toLowerCase())
  );
  if (invalidTags.length > 0) {
    issues.push({
      severity: 'error',
      message: `Invalid tags found: ${invalidTags.join(', ')}`,
      line: findLineNumber(content, 'tags:'),
    });
  }
}

// 2. Check image exists before truncate
function checkImageBeforeTruncate(content: string, issues: ValidationIssue[]) {
  const truncateShort = '<!--truncate-->';
  const truncateLong = '<!-- truncate -->';
  const truncateIndex = content.includes(truncateShort)
    ? content.indexOf(truncateShort)
    : content.includes(truncateLong)
    ? content.indexOf(truncateLong)
    : -1;

  if (truncateIndex === -1) {
    issues.push({ severity: 'error', message: 'No truncate tag found', line: 0 });
    return;
  }

  const before = content.substring(0, truncateIndex);
  imageTagsAndMarkdownRegex.lastIndex = 0;
  if (!imageTagsAndMarkdownRegex.test(before)) {
    issues.push({
      severity: 'error',
      message: 'No image found before the truncate tag',
      line: findLineNumber(content, truncateIndex === content.indexOf(truncateShort) ? truncateShort : truncateLong),
    });
  }
}

// 3. Check social media links
function checkSocialMediaLinks(content: string, issues: ValidationIssue[]) {
  socialMediaRegex.lastIndex = 0;
  if (!socialMediaRegex.test(content)) {
    issues.push({
      severity: 'error',
      message: 'No social media links found (Facebook, X, LinkedIn, etc.)',
      line: content.split('\n').length - 1,
    });
  }
}

// 4. Check required front matter fields
function checkFrontMatterFields(content: string, issues: ValidationIssue[]) {
  const attrs = parseFrontMatter(content);
  if (!attrs) return;

  const required = ['title', 'authors', 'description', 'tags', 'image'];
  const missing = required.filter(f => !attrs[f]);
  if (missing.length > 0) {
    issues.push({
      severity: 'error',
      message: `Missing required front matter fields: ${missing.join(', ')}`,
      line: 0,
    });
  }
}

// 5. Check description length
function checkDescriptionLength(content: string, issues: ValidationIssue[]) {
  const attrs = parseFrontMatter(content);
  if (!attrs?.description) return;

  const len = attrs.description.length;
  if (len < 110 || len > 160) {
    issues.push({
      severity: 'warning',
      message: `Description is ${len} characters. Should be between 110 and 160.`,
      line: findLineNumber(content, 'description:'),
    });
  }
}

// 6. Check first subheading is H2
function checkFirstSubheading(content: string, issues: ValidationIssue[]) {
  // Skip frontmatter
  const body = content.replace(/^---[\s\S]*?---\n/, '');
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#')) {
      if (!line.startsWith('## ')) {
        issues.push({
          severity: 'error',
          message: `First subheading must be H2 (##). Found: "${line.trim()}"`,
          line: findLineNumber(content, line),
        });
      }
      return;
    }
  }
  issues.push({ severity: 'warning', message: 'No subheading found in article body', line: 0 });
}

// 7. Image checks (Option B — no sharp, no dimension math)
function checkImages(content: string, workspaceRoot: string, issues: ValidationIssue[]) {
  const attrs = parseFrontMatter(content);
  const coverImage = attrs?.image;

  if (!coverImage) {
    issues.push({ severity: 'error', message: 'No cover image specified in front matter', line: 0 });
  }

  // Check cover image exists on disk
  if (coverImage) {
    const coverPath = path.join(workspaceRoot, 'website/static', coverImage);
    if (!fs.existsSync(coverPath)) {
      issues.push({
        severity: 'error',
        message: `Cover image not found on disk: ${coverImage}`,
        line: findLineNumber(content, 'image:'),
      });
    }
  }

  imageTagsRegex.lastIndex = 0;
  let match;
  let isFirst = true;

  while ((match = imageTagsRegex.exec(content)) !== null) {
    const [tag, , mdImageSrc] = match;
    const isMarkdown = tag.startsWith('![');

    if (isMarkdown) {
      const src = mdImageSrc?.trim();
      if (src && !src.startsWith('http')) {
        issues.push({
          severity: 'warning',
          message: `Markdown image syntax found. Use <img> tag instead: ${tag.substring(0, 60)}`,
          line: findLineNumber(content, tag),
        });
      }
      isFirst = false;
      continue;
    }

    // It's an <img> tag — check required attributes
    const srcMatch = tag.match(srcAttributeRegex);
    const altMatch = tag.match(altAttributeRegex);
    const widthMatch = tag.match(widthAttributeRegex);
    const heightMatch = tag.match(heightAttributeRegex);
    const decodingMatch = tag.match(decodingAttributeRegex);
    const loadingMatch = tag.match(loadingAttributeRegex);
    const tagLine = findLineNumber(content, tag);

    const imageSrc = srcMatch ? (srcMatch[1] || srcMatch[2]) : null;

    if (!imageSrc) {
      issues.push({ severity: 'error', message: `Missing src attribute in <img> tag`, line: tagLine });
      isFirst = false;
      continue;
    }

    // Skip external images
    if (/^https?:/i.test(imageSrc)) { isFirst = false; continue; }

    // Normalize path
    const normalizedSrc = imageSrc.startsWith('/blog/')
      ? imageSrc.substring('/blog/'.length - 1)
      : imageSrc;

    // Check image exists on disk
    const imgFullPath = path.join(workspaceRoot, 'website/static', normalizedSrc);
    if (!imgFullPath.toLowerCase().endsWith('.svg') && !fs.existsSync(imgFullPath)) {
      issues.push({
        severity: 'error',
        message: `Image not found on disk: ${normalizedSrc}`,
        line: tagLine,
      });
    }

    // Check naming convention
    const imageName = path.basename(normalizedSrc);
    if (!imageName.match(imageNameRegex)) {
      issues.push({
        severity: 'warning',
        message: `Image does not follow naming convention {name}_{dpi}dpi.{ext}: ${imageName}`,
        line: tagLine,
      });
    }

    // Check required attributes
    if (!altMatch) {
      issues.push({ severity: 'error', message: `Missing alt attribute in <img>: ${imageName}`, line: tagLine });
    }
    if (!widthMatch) {
      issues.push({ severity: 'warning', message: `Missing width attribute in <img>: ${imageName}`, line: tagLine });
    }
    if (!heightMatch) {
      issues.push({ severity: 'warning', message: `Missing height attribute in <img>: ${imageName}`, line: tagLine });
    }
    if (!decodingMatch) {
      issues.push({ severity: 'warning', message: `Missing decoding attribute in <img>: ${imageName}`, line: tagLine });
    }
    if (!loadingMatch) {
      issues.push({ severity: 'warning', message: `Missing loading attribute in <img>: ${imageName}`, line: tagLine });
    }

    // First image should match cover image
    if (isFirst && coverImage) {
      const firstImgNormalized = normalizedSrc.replace(/^\//, '');
      const coverNormalized = coverImage.replace(/^\//, '');
      if (firstImgNormalized !== coverNormalized) {
        issues.push({
          severity: 'warning',
          message: `First image (${firstImgNormalized}) doesn't match cover image (${coverNormalized})`,
          line: tagLine,
        });
      }
    }

    isFirst = false;
  }
}

// Main validate function
export function validateArticle(content: string, workspaceRoot: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  checkMetaBlock(content, issues);
  checkFrontMatterFields(content, issues);
  checkDescriptionLength(content, issues);
  checkImageBeforeTruncate(content, issues);
  checkFirstSubheading(content, issues);
  checkSocialMediaLinks(content, issues);
  checkImages(content, workspaceRoot, issues);

  return issues;
}
