#!/usr/bin/env node
/**
 * One-time migration: Convert structuredDataHtml strings → structuredData JSON arrays.
 *
 * Currently, each page stores JSON-LD as a raw HTML string in structuredDataHtml.
 * This means the full schema is duplicated (with translations) in every language file.
 *
 * After migration:
 * - EN files get structuredData: [{...}, {...}] (parsed JSON-LD objects)
 * - Non-EN files get structuredData with only the translated fields
 *   (name, description, featureList, FAQ items, etc.) — structure inherited from EN via deep merge
 * - build.js wraps structuredData back into <script type="application/ld+json"> at build time
 *
 * Usage: node convert-structured-data.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

// Fields in JSON-LD that are structural (same across languages, inherit from EN)
const STRUCTURAL_SCHEMA_FIELDS = new Set([
    '@context', '@type', 'applicationCategory', 'offers',
    'aggregateRating', 'author', 'publisher', 'screenshot',
    'softwareVersion', 'releaseNotes', 'inLanguage', 'countriesSupported',
    'datePublished', 'dateModified', 'downloadUrl', 'installUrl',
    'sameAs', 'knowsAbout', 'areaServed', 'foundingDate', 'email',
    'url', 'logo', 'review'
]);

// Fields that are translatable (keep in non-EN overlays)
const TRANSLATABLE_SCHEMA_FIELDS = new Set([
    'name', 'alternateName', 'description', 'applicationSubCategory',
    'operatingSystem', 'featureList', 'award', 'headline',
    'mainEntity'  // FAQ items
]);

/**
 * Parse JSON-LD script blocks from structuredDataHtml.
 * Returns array of parsed JSON objects.
 */
function parseJsonLd(htmlStr) {
    if (!htmlStr || !htmlStr.trim()) return [];

    const blocks = [];
    const regex = /<script\s+type="application\/ld\+json"\s*>([\s\S]*?)<\/script>/g;
    let match;
    while ((match = regex.exec(htmlStr)) !== null) {
        try {
            blocks.push(JSON.parse(match[1]));
        } catch (e) {
            console.error(`    Warning: Failed to parse JSON-LD block: ${e.message}`);
        }
    }
    return blocks;
}

/**
 * Strip structural fields from a JSON-LD object, keeping only translatable ones.
 * Used for non-EN files to create minimal overlays.
 */
function stripToTranslatable(obj, enObj) {
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    for (const key of Object.keys(obj)) {
        if (TRANSLATABLE_SCHEMA_FIELDS.has(key)) {
            if (key === 'mainEntity' && Array.isArray(obj[key])) {
                // For FAQ mainEntity, keep only question/answer text
                result[key] = obj[key].map(item => {
                    if (item['@type'] === 'Question') {
                        return {
                            '@type': 'Question',
                            'name': item.name,
                            'acceptedAnswer': {
                                '@type': 'Answer',
                                'text': item.acceptedAnswer?.text
                            }
                        };
                    }
                    return item;
                });
            } else {
                result[key] = obj[key];
            }
        }
    }
    return result;
}

/**
 * Check if a stripped object has any meaningful translatable content.
 */
function hasTranslatableContent(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return Object.keys(obj).length > 0;
}

let processed = 0;
let errors = 0;
let skipped = 0;

// First pass: load EN data for reference
const enData = {};
const enDir = path.join(DATA_DIR, 'en');
for (const file of fs.readdirSync(enDir)) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(enDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const sdHtml = data.data?.structuredDataHtml;
    if (sdHtml && sdHtml.trim()) {
        enData[file] = parseJsonLd(sdHtml);
    }
}

// Process all languages
for (const langCode of Object.keys(languages)) {
    const langDir = path.join(DATA_DIR, langCode);
    if (!fs.existsSync(langDir)) continue;

    for (const file of fs.readdirSync(langDir)) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(langDir, file);
        try {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const fileData = JSON.parse(fileContent);

            const sdHtml = fileData.data?.structuredDataHtml;

            // Skip files with no structuredDataHtml
            if (!sdHtml && sdHtml !== '') {
                continue;
            }

            // Handle empty structuredDataHtml
            if (!sdHtml || !sdHtml.trim()) {
                // Remove the empty string field entirely
                if (fileData.data && 'structuredDataHtml' in fileData.data) {
                    delete fileData.data.structuredDataHtml;
                    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2) + '\n');
                    skipped++;
                }
                continue;
            }

            const parsedBlocks = parseJsonLd(sdHtml);
            if (parsedBlocks.length === 0) {
                skipped++;
                continue;
            }

            const isEN = langCode === 'en';

            // Replace structuredDataHtml with structuredData
            delete fileData.data.structuredDataHtml;

            if (isEN) {
                // EN: store full parsed JSON-LD
                fileData.data.structuredData = parsedBlocks;
            } else {
                // Non-EN: store only translatable fields
                const enBlocks = enData[file] || [];
                const overlayBlocks = parsedBlocks.map((block, i) => {
                    const enBlock = enBlocks[i] || {};
                    return stripToTranslatable(block, enBlock);
                }).filter(hasTranslatableContent);

                if (overlayBlocks.length > 0) {
                    fileData.data.structuredData = overlayBlocks;
                }
            }

            fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2) + '\n');
            console.log(`  ✓ ${langCode}/${file}: ${parsedBlocks.length} JSON-LD block(s)${isEN ? '' : ' (overlay: ' + (fileData.data.structuredData?.length || 0) + ' blocks)'}`);
            processed++;
        } catch (err) {
            console.error(`  ✗ ${langCode}/${file}: ${err.message}`);
            errors++;
        }
    }
}

console.log(`\nDone! Processed ${processed} files, skipped ${skipped}.${errors ? ' ' + errors + ' error(s).' : ''}`);
if (errors) process.exit(1);
