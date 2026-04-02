#!/usr/bin/env node
/**
 * One-time migration: Convert about page bodyContent HTML → structured JSON.
 *
 * Reads data/{lang}/about.utility.json for all languages,
 * parses the monolithic bodyContent HTML into structured sections,
 * and overwrites each file with template "about-page".
 *
 * Usage: node convert-about.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

/**
 * Parse the about page bodyContent HTML into structured data.
 *
 * Extracts the hero section (logo, h1, subtitle) and stores
 * all remaining <section> blocks as raw HTML in contentSections[].
 */
function parseBodyContent(bodyContent) {
    let html = bodyContent;

    // Extract hero section
    const heroMatch = html.match(/<section class="hero center-text">([\s\S]*?)<\/section>/);
    const hero = { logoText: '', title: '', subtitle: '' };
    if (heroMatch) {
        const heroHtml = heroMatch[1];
        const logoMatch = heroHtml.match(/<div class="hero-logo">(.*?)<\/div>/);
        hero.logoText = logoMatch ? logoMatch[1].trim() : '';
        const h1Match = heroHtml.match(/<h1>(.*?)<\/h1>/);
        hero.title = h1Match ? h1Match[1].trim() : '';
        const subtitleMatch = heroHtml.match(/<p class="hero-subtitle">(.*?)<\/p>/);
        hero.subtitle = subtitleMatch ? subtitleMatch[1].trim() : '';
    }

    // Remove the hero section from the HTML
    html = html.replace(/<!-- Hero Section -->\s*/, '');
    html = html.replace(/<section class="hero center-text">[\s\S]*?<\/section>\s*/, '');

    // Split the remaining HTML into sections
    // Each section is a <section ...>...</section> block
    const contentSections = [];
    const sectionRegex = /(\s*(?:<!--[^>]*-->\s*)?<section[\s\S]*?<\/section>)/g;
    let match;
    while ((match = sectionRegex.exec(html)) !== null) {
        contentSections.push({ html: match[1].trim() });
    }

    return { hero, contentSections };
}

let processed = 0;
let errors = 0;

for (const langCode of Object.keys(languages)) {
    const filePath = path.join(DATA_DIR, langCode, 'about.utility.json');
    if (!fs.existsSync(filePath)) {
        console.log(`  Skip: ${langCode} (no about.utility.json)`);
        continue;
    }

    try {
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const bodyContent = fileData.data.bodyContent;

        if (!bodyContent) {
            console.log(`  Skip: ${langCode} (no bodyContent)`);
            continue;
        }

        const { hero, contentSections } = parseBodyContent(bodyContent);

        const isEN = langCode === 'en';
        const newData = isEN ? {
            template: 'about-page',
            lang: fileData.lang,
            slug: fileData.slug,
            path: fileData.path,
            outputPath: fileData.outputPath,
            data: {
                meta: fileData.data.meta,
                structuredDataHtml: fileData.data.structuredDataHtml,
                hero,
                contentSections
            }
        } : {
            data: {
                meta: fileData.data.meta,
                structuredDataHtml: fileData.data.structuredDataHtml,
                hero,
                contentSections
            }
        };

        fs.writeFileSync(filePath, JSON.stringify(newData, null, 2) + '\n');
        console.log(`  ✓ ${langCode}: hero.title="${hero.title}", ${contentSections.length} content sections`);
        processed++;
    } catch (err) {
        console.error(`  ✗ ${langCode}: ${err.message}`);
        errors++;
    }
}

console.log(`\nDone! Processed ${processed} languages.${errors ? ' ' + errors + ' error(s).' : ''}`);
if (errors) process.exit(1);
