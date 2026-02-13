#!/usr/bin/env node
/**
 * One-time migration: converts HTML in translatable JSON fields to markdown.
 *
 * Converts: <p>, <strong>, <a href="..." target="_blank" rel="noopener">
 * Skips: structuredDataHtml, bodyContent, christmasHtml, customCss, santaScript, etc.
 *
 * Run: node migrate-to-md.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// Fields that contain raw HTML and should NOT be converted
const SKIP_FIELDS = new Set([
    'structuredDataHtml', 'bodyContent', 'christmasHtml', 'christmasBannerHtml',
    'doctorEndorsementHtml', 'customCss', 'santaScript'
]);

// Fields known to contain translatable HTML
const HTML_FIELDS = new Set([
    'answer', 'content', 'description', 'text', 'title', 'badge',
    'disclaimerTitle', 'copyright'
]);

function htmlToMarkdown(html) {
    let md = html;

    // Remove wrapping <p>...</p> tags — convert to double newlines between paragraphs
    // First handle multiple paragraphs: </p><p> or </p>\n<p> → double newline
    md = md.replace(/<\/p>\s*<p>/g, '\n\n');
    // Remove outer <p> and </p>
    md = md.replace(/^\s*<p>\s*/g, '');
    md = md.replace(/\s*<\/p>\s*$/g, '');
    // Any remaining <p> or </p> (shouldn't happen, but just in case)
    md = md.replace(/<p>/g, '\n\n');
    md = md.replace(/<\/p>/g, '');

    // <strong>text</strong> → **text**
    md = md.replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**');

    // <a href="url" target="_blank" rel="noopener" style="...">text</a> → [text](url)
    md = md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)');

    // <h2>...</h2>, <h3>...</h3> — keep as-is, these are rare structural elements
    // Actually, let me check if these should be converted too
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, '## $1');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, '### $1');

    // <i class="..."></i> — icon markup, keep as-is
    // These aren't translatable text

    // <section ...> tags — keep as-is
    // These are structural

    // <br> or <br/> → newline
    md = md.replace(/<br\s*\/?>/g, '\n');

    // Trim
    md = md.trim();

    return md;
}

function hasHtmlTags(str) {
    return typeof str === 'string' && /<[a-z][a-z0-9]*[\s>]/i.test(str);
}

function processValue(key, value) {
    if (typeof value !== 'string') return value;
    if (SKIP_FIELDS.has(key)) return value;
    if (!hasHtmlTags(value)) return value;

    // Check for tags we can't convert (section, i with class, etc.)
    // If it has tags beyond p, strong, a, h2, h3, br — skip
    const knownTags = value.replace(/<\/?(p|strong|a|h[23]|br)[^>]*>/g, '');
    if (/<[a-z]/i.test(knownTags)) {
        // Has unknown HTML tags — don't convert, might break things
        console.warn(`  Skipping field "${key}": has unsupported tags`);
        return value;
    }

    return htmlToMarkdown(value);
}

function processObject(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => processObject(item));
    }
    if (typeof obj === 'object' && obj !== null) {
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
            if (SKIP_FIELDS.has(k)) {
                result[k] = v;
            } else if (typeof v === 'string') {
                result[k] = processValue(k, v);
            } else {
                result[k] = processObject(v);
            }
        }
        return result;
    }
    return obj;
}

function migrate() {
    console.log('Migrating HTML → Markdown in data files\n');

    const langs = fs.readdirSync(DATA_DIR)
        .filter(f => fs.statSync(path.join(DATA_DIR, f)).isDirectory());

    for (const lang of langs.sort()) {
        const file = path.join(DATA_DIR, lang, 'pages.json');
        if (!fs.existsSync(file)) continue;

        console.log(`Processing ${lang}/pages.json...`);
        const pages = JSON.parse(fs.readFileSync(file, 'utf8'));
        const converted = pages.map(page => ({
            ...page,
            data: processObject(page.data)
        }));

        fs.writeFileSync(file, JSON.stringify(converted, null, 2) + '\n');
        console.log(`  Done (${pages.length} pages)`);
    }

    console.log('\nMigration complete. Now update templates to use {{md field}} for markdown fields.');
}

migrate();
