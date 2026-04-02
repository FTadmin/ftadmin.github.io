#!/usr/bin/env node
/**
 * One-time migration: Convert support page bodyContent HTML → structured JSON.
 *
 * Reads data/{lang}/support.utility.json for all languages,
 * parses the monolithic bodyContent HTML into structured fields,
 * and overwrites each file with template "support-page".
 *
 * Usage: node convert-support.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

/**
 * Convert HTML inline content to markdown:
 *  - <strong>text</strong> → **text**
 *  - <a href="url">text</a> → [text](url)
 *  - strip <p> tags
 */
function htmlToMarkdown(html) {
    if (!html) return '';
    let text = html;
    text = text.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    text = text.replace(/<a\s+href\s*=\s*"([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)');
    text = text.replace(/<\/p>\s*<p>/g, '\n\n');
    text = text.replace(/<\/?p>/g, '');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();
    return text;
}

/**
 * Parse the support page bodyContent HTML into structured data.
 */
function parseBodyContent(bodyContent) {
    let html = bodyContent;

    // Extract <h1> page title
    const h1Match = html.match(/<h1>(.*?)<\/h1>/);
    const pageTitle = h1Match ? h1Match[1].trim() : '';

    // Extract contact box
    const contactMatch = html.match(/<div class="contact-box">([\s\S]*?)<\/div>/);
    const contact = { title: '', supportText: '', faqText: '' };
    if (contactMatch) {
        const contactHtml = contactMatch[1];
        const h2Match = contactHtml.match(/<h2>(.*?)<\/h2>/);
        contact.title = h2Match ? h2Match[1].trim() : '';
        const paragraphs = [];
        const pRegex = /<p>([\s\S]*?)<\/p>/g;
        let m;
        while ((m = pRegex.exec(contactHtml)) !== null) {
            paragraphs.push(m[1].trim());
        }
        // Store inner HTML as-is (preserves links and punctuation per language)
        if (paragraphs.length >= 1) contact.supportText = paragraphs[0];
        if (paragraphs.length >= 2) contact.faqText = paragraphs[1];
    }

    // Extract support-section divs
    const sectionRegex = /<div class="support-section">([\s\S]*?)<\/div>/g;
    const sections = [];
    let sm;
    while ((sm = sectionRegex.exec(html)) !== null) {
        sections.push(sm[1]);
    }

    // First support-section: apps
    const apps = { title: '', items: [] };
    if (sections.length >= 1) {
        const sectionHtml = sections[0];
        const h2Match = sectionHtml.match(/<h2>(.*?)<\/h2>/);
        apps.title = h2Match ? h2Match[1].trim() : '';

        const liRegex = /<li>([\s\S]*?)<\/li>/g;
        let lm;
        while ((lm = liRegex.exec(sectionHtml)) !== null) {
            const liContent = lm[1].trim();
            // Pattern: <a href="url">Name</a> - Description (or — em dash)
            const linkMatch = liContent.match(/<a\s+href\s*=\s*"([^"]*)"[^>]*>(.*?)<\/a>(\s*(?:-|—|–)\s*)(.*)/);
            if (linkMatch) {
                apps.items.push({
                    name: htmlToMarkdown(linkMatch[2].trim()),
                    url: linkMatch[1].trim(),
                    separator: linkMatch[3],
                    description: htmlToMarkdown(linkMatch[4].trim())
                });
            }
        }
    }

    // Second support-section: resources
    const resources = { title: '', items: [] };
    if (sections.length >= 2) {
        const sectionHtml = sections[1];
        const h2Match = sectionHtml.match(/<h2>(.*?)<\/h2>/);
        resources.title = h2Match ? h2Match[1].trim() : '';

        const liRegex = /<li>([\s\S]*?)<\/li>/g;
        let lm;
        while ((lm = liRegex.exec(sectionHtml)) !== null) {
            const liContent = lm[1].trim();
            const linkMatch = liContent.match(/<a\s+href\s*=\s*"([^"]*)"[^>]*>(.*?)<\/a>/);
            if (linkMatch) {
                resources.items.push({
                    name: htmlToMarkdown(linkMatch[2].trim()),
                    url: linkMatch[1].trim()
                });
            }
        }
    }

    return { pageTitle, contact, apps, resources };
}

// Process all languages
let processed = 0;
let errors = 0;

for (const langCode of Object.keys(languages)) {
    const filePath = path.join(DATA_DIR, langCode, 'support.utility.json');
    if (!fs.existsSync(filePath)) {
        console.log(`  Skip: ${langCode} (no support.utility.json)`);
        continue;
    }

    try {
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const bodyContent = fileData.data.bodyContent;

        if (!bodyContent) {
            console.log(`  Skip: ${langCode} (no bodyContent)`);
            continue;
        }

        const { pageTitle, contact, apps, resources } = parseBodyContent(bodyContent);

        // Build new structured data
        const isEN = langCode === 'en';
        const newData = isEN ? {
            template: 'support-page',
            lang: fileData.lang,
            slug: fileData.slug,
            path: fileData.path,
            outputPath: fileData.outputPath,
            data: {
                meta: fileData.data.meta,
                structuredDataHtml: fileData.data.structuredDataHtml,
                pageTitle,
                contact,
                apps,
                resources
            }
        } : {
            data: {
                meta: fileData.data.meta,
                structuredDataHtml: fileData.data.structuredDataHtml,
                pageTitle,
                contact,
                apps,
                resources
            }
        };

        fs.writeFileSync(filePath, JSON.stringify(newData, null, 2) + '\n');
        console.log(`  ✓ ${langCode}: pageTitle="${pageTitle}", ${apps.items.length} apps, ${resources.items.length} resources`);
        processed++;
    } catch (err) {
        console.error(`  ✗ ${langCode}: ${err.message}`);
        errors++;
    }
}

console.log(`\nDone! Processed ${processed} languages.${errors ? ' ' + errors + ' error(s).' : ''}`);
if (errors) process.exit(1);
