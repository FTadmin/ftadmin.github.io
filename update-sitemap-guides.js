#!/usr/bin/env node
/**
 * Regenerates the guide-pages block in sitemap.xml.
 *
 * Guide pages (EN files with "enOnly": true, e.g. data/en/*.guide.json) exist
 * per-locale only where a translation overlay file exists. This script scans
 * that availability and rewrites everything between the markers
 *   <!-- guides:start -->  and  <!-- guides:end -->
 * in sitemap.xml: one <url> per available locale per guide, with a full
 * hreflang cluster (plus x-default → EN) once a guide exists in more than one
 * language. <lastmod> comes from each guide's data.dateModified.
 *
 * Run after adding/removing a guide or a guide translation:
 *   node update-sitemap-guides.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const REF_LANG = 'en';
const START = '  <!-- guides:start -->';
const END = '  <!-- guides:end -->';

function toBcp47(code) {
    return code.replace(/-([a-zA-Z]{2})$/, (_, region) => '-' + region.toUpperCase());
}

const site = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'site.json'), 'utf8'));
const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

const langDirs = fs.readdirSync(DATA_DIR).filter(entry =>
    entry !== REF_LANG &&
    languages[entry] &&
    fs.statSync(path.join(DATA_DIR, entry)).isDirectory());

// Collect guides: EN pages flagged enOnly, sorted by filename for stable output
const guides = [];
for (const file of fs.readdirSync(path.join(DATA_DIR, REF_LANG)).sort()) {
    if (!file.endsWith('.json')) continue;
    const page = JSON.parse(fs.readFileSync(path.join(DATA_DIR, REF_LANG, file), 'utf8'));
    if (!page.enOnly) continue;
    const availableLangs = [REF_LANG, ...langDirs.filter(entry =>
        fs.existsSync(path.join(DATA_DIR, entry, file)))];
    guides.push({
        path: page.path,
        lastmod: (page.data && page.data.dateModified) || null,
        availableLangs
    });
}

function urlFor(langCode, pagePath) {
    const prefix = languages[langCode].prefix || '';
    return site.url + prefix + '/' + pagePath + '/';
}

const lines = [];
for (const guide of guides) {
    const multi = guide.availableLangs.length > 1;
    for (const langCode of guide.availableLangs) {
        lines.push('  <url>');
        lines.push(`    <loc>${urlFor(langCode, guide.path)}</loc>`);
        if (multi) {
            for (const alt of guide.availableLangs) {
                lines.push(`    <xhtml:link rel="alternate" hreflang="${toBcp47(alt)}" href="${urlFor(alt, guide.path)}"/>`);
            }
            lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(REF_LANG, guide.path)}"/>`);
        }
        if (guide.lastmod) lines.push(`    <lastmod>${guide.lastmod}</lastmod>`);
        lines.push('  </url>');
    }
}

const sitemap = fs.readFileSync(SITEMAP, 'utf8');
const startIdx = sitemap.indexOf(START);
const endIdx = sitemap.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
    console.error(`ERROR: markers not found in sitemap.xml — expected "${START.trim()}" and "${END.trim()}"`);
    process.exit(1);
}
const updated = sitemap.slice(0, startIdx + START.length) + '\n' +
    lines.join('\n') + '\n' +
    sitemap.slice(endIdx);
fs.writeFileSync(SITEMAP, updated);

const total = guides.reduce((n, g) => n + g.availableLangs.length, 0);
console.log(`Wrote ${total} guide URL(s) for ${guides.length} guide(s):`);
for (const g of guides) {
    console.log(`  ${g.path}: ${g.availableLangs.join(', ')}`);
}
