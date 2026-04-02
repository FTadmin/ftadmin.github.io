#!/usr/bin/env node
/**
 * One-time migration: Convert privacy and terms bodyContent HTML → structured JSON.
 *
 * Reads data/{lang}/privacy.utility.json and data/{lang}/terms.utility.json for all languages,
 * parses the monolithic bodyContent HTML into structured sections,
 * and overwrites each file with template "legal-page".
 *
 * Usage: node convert-legal.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

/**
 * Parse legal page bodyContent HTML into structured data.
 * Splits on <h2> tags, preserving all inner HTML as-is.
 */
function parseBodyContent(bodyContent) {
    let html = bodyContent;

    // Extract <h1> page title
    const h1Match = html.match(/<h1>(.*?)<\/h1>/);
    const pageTitle = h1Match ? h1Match[1].trim() : '';
    html = html.replace(/<h1>.*?<\/h1>\s*/, '');

    // Split by <h2> into sections
    // h2Parts[0] = content before first h2 (intro)
    // h2Parts[1] = first h2 title, h2Parts[2] = content after, etc.
    const h2Parts = html.split(/<h2>(.*?)<\/h2>/);

    // Intro: everything before first h2
    const intro = cleanHtml(h2Parts[0]);

    const sections = [];
    for (let i = 1; i < h2Parts.length; i += 2) {
        const heading = h2Parts[i].trim();
        const content = cleanHtml(h2Parts[i + 1] || '');
        sections.push({ heading, content });
    }

    return { pageTitle, intro, sections };
}

/**
 * Clean up HTML content:
 * - Remove <div> and </div> tags (but keep inner content and whitespace)
 * - Trim leading/trailing whitespace
 */
function cleanHtml(html) {
    if (!html) return '';
    let text = html;
    // Remove div tags preserving newlines
    text = text.replace(/<div[^>]*>\n?/g, '');
    text = text.replace(/\n?<\/div>/g, '');
    // Trim
    text = text.trim();
    return text;
}

const FILES = ['privacy.utility.json', 'terms.utility.json'];

let processed = 0;
let errors = 0;

for (const fileName of FILES) {
    console.log(`\nProcessing ${fileName}:`);

    for (const langCode of Object.keys(languages)) {
        const filePath = path.join(DATA_DIR, langCode, fileName);
        if (!fs.existsSync(filePath)) {
            console.log(`  Skip: ${langCode} (no ${fileName})`);
            continue;
        }

        try {
            const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const bodyContent = fileData.data.bodyContent;

            if (!bodyContent) {
                console.log(`  Skip: ${langCode} (no bodyContent)`);
                continue;
            }

            const { pageTitle, intro, sections } = parseBodyContent(bodyContent);

            const isEN = langCode === 'en';
            const newData = isEN ? {
                template: 'legal-page',
                lang: fileData.lang,
                slug: fileData.slug,
                path: fileData.path,
                outputPath: fileData.outputPath,
                data: {
                    meta: fileData.data.meta,
                    structuredDataHtml: fileData.data.structuredDataHtml,
                    pageTitle,
                    intro,
                    sections
                }
            } : {
                data: {
                    meta: fileData.data.meta,
                    structuredDataHtml: fileData.data.structuredDataHtml,
                    pageTitle,
                    intro,
                    sections
                }
            };

            fs.writeFileSync(filePath, JSON.stringify(newData, null, 2) + '\n');
            console.log(`  ✓ ${langCode}: pageTitle="${pageTitle}", ${sections.length} sections`);
            processed++;
        } catch (err) {
            console.error(`  ✗ ${langCode}: ${err.message}`);
            errors++;
        }
    }
}

console.log(`\nDone! Processed ${processed} files.${errors ? ' ' + errors + ' error(s).' : ''}`);
if (errors) process.exit(1);
