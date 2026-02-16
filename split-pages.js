#!/usr/bin/env node
/**
 * One-time migration: splits each data/{lang}/pages.json into individual page files.
 *
 * Naming convention:
 *   {slug}.app.json      — app-page
 *   {slug}.tips.json     — tips-page
 *   {slug}.utility.json  — utility-page
 *   index.json           — index-page (no slug)
 *
 * Usage: node split-pages.js
 *
 * After running, verify with:  node build.js
 * Then delete old pages.json files from each data/{lang}/ directory
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

const TEMPLATE_SHORT = {
    'app-page': 'app',
    'tips-page': 'tips',
    'utility-page': 'utility',
    'index-page': 'index'
};

function pageFilename(page) {
    const short = TEMPLATE_SHORT[page.template];
    if (!short) throw new Error(`Unknown template: ${page.template}`);
    if (page.template === 'index-page') return 'index.json';
    return `${page.slug}.${short}.json`;
}

const langs = fs.readdirSync(DATA_DIR)
    .filter(f => fs.statSync(path.join(DATA_DIR, f)).isDirectory());

let totalFiles = 0;

for (const lang of langs.sort()) {
    const pagesFile = path.join(DATA_DIR, lang, 'pages.json');
    if (!fs.existsSync(pagesFile)) {
        console.log(`  skip ${lang}/ — no pages.json`);
        continue;
    }

    const pages = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
    console.log(`\n${lang}/ — ${pages.length} pages`);

    for (const page of pages) {
        const filename = pageFilename(page);
        const outPath = path.join(DATA_DIR, lang, filename);
        fs.writeFileSync(outPath, JSON.stringify(page, null, 2) + '\n');
        console.log(`  → ${lang}/${filename}`);
        totalFiles++;
    }
}

console.log(`\nDone! Wrote ${totalFiles} files.`);
console.log('Next steps:');
console.log('  1. Run "node build.js" to verify output is identical');
console.log('  2. Delete old files: rm data/*/pages.json');
