#!/usr/bin/env node
/**
 * Validates structural parity across language files.
 * Uses EN as the reference — every other language must have:
 *   - The same set of page slugs
 *   - The same data keys and array lengths per page
 *
 * Usage: node validate.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const REF_LANG = 'en';

function loadLanguagePages(lang) {
    const file = path.join(DATA_DIR, lang, 'pages.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Get the structural shape of a value — keys for objects, length for arrays,
 * type name for primitives. Recurses one level deep for objects.
 */
function getShape(value, depth) {
    if (depth === undefined) depth = 0;
    if (value === null || value === undefined) return { type: 'null' };
    if (Array.isArray(value)) {
        return { type: 'array', length: value.length };
    }
    if (typeof value === 'object') {
        const shape = { type: 'object', keys: {} };
        for (const [k, v] of Object.entries(value)) {
            if (depth < 3) {
                shape.keys[k] = getShape(v, depth + 1);
            } else {
                shape.keys[k] = { type: Array.isArray(v) ? 'array' : typeof v, length: Array.isArray(v) ? v.length : undefined };
            }
        }
        return shape;
    }
    return { type: typeof value };
}

/**
 * Compare two shapes and return a list of differences.
 */
function compareShapes(refShape, targetShape, path) {
    const diffs = [];

    if (refShape.type !== targetShape.type) {
        diffs.push(`${path}: type mismatch (EN: ${refShape.type}, got: ${targetShape.type})`);
        return diffs;
    }

    if (refShape.type === 'array' && refShape.length !== targetShape.length) {
        diffs.push(`${path}: array length mismatch (EN: ${refShape.length}, got: ${targetShape.length})`);
    }

    if (refShape.type === 'object' && refShape.keys && targetShape.keys) {
        const refKeys = new Set(Object.keys(refShape.keys));
        const targetKeys = new Set(Object.keys(targetShape.keys));

        for (const k of refKeys) {
            if (!targetKeys.has(k)) {
                diffs.push(`${path}.${k}: missing key (exists in EN)`);
            } else {
                diffs.push(...compareShapes(refShape.keys[k], targetShape.keys[k], `${path}.${k}`));
            }
        }
        for (const k of targetKeys) {
            if (!refKeys.has(k)) {
                diffs.push(`${path}.${k}: extra key (not in EN)`);
            }
        }
    }

    return diffs;
}

function validate() {
    console.log('Validate: checking structural parity against EN\n');

    // Discover languages
    const langs = fs.readdirSync(DATA_DIR)
        .filter(f => fs.statSync(path.join(DATA_DIR, f)).isDirectory() && f !== REF_LANG);

    const refPages = loadLanguagePages(REF_LANG);
    if (!refPages) {
        console.error('ERROR: EN pages not found at data/en/pages.json');
        process.exit(1);
    }

    // Index EN pages by slug+template (multiple pages can share a slug)
    const refByKey = {};
    for (const p of refPages) {
        refByKey[p.slug + ':' + p.template] = p;
    }

    let totalWarnings = 0;
    let structuralErrors = 0;
    let missingPages = 0;

    for (const lang of langs.sort()) {
        const pages = loadLanguagePages(lang);
        if (!pages) {
            console.error(`  ✗ ${lang}: pages.json not found`);
            totalWarnings++;
            continue;
        }

        const targetByKey = {};
        for (const p of pages) {
            targetByKey[p.slug + ':' + p.template] = p;
        }

        // Check for missing/extra pages
        const refKeys = new Set(Object.keys(refByKey));
        const targetKeys = new Set(Object.keys(targetByKey));

        for (const key of refKeys) {
            if (!targetKeys.has(key)) {
                console.warn(`  ✗ ${lang}: missing page "${key}"`);
                missingPages++;
                structuralErrors++;
            }
        }
        for (const key of targetKeys) {
            if (!refKeys.has(key)) {
                console.warn(`  ✗ ${lang}: extra page "${key}" (not in EN)`);
                structuralErrors++;
            }
        }

        // Compare data shape for each shared page
        for (const key of refKeys) {
            if (!targetKeys.has(key)) continue;

            const refPage = refByKey[key];
            const targetPage = targetByKey[key];

            const refShape = getShape(refPage.data, 0);
            const targetShape = getShape(targetPage.data, 0);
            const diffs = compareShapes(refShape, targetShape, `data`);

            for (const diff of diffs) {
                const isArrayLen = diff.includes('array length mismatch');
                const prefix = isArrayLen ? '⚠' : '✗';
                console.warn(`  ${prefix} ${lang}/${refPage.slug} (${refPage.template}): ${diff}`);
                totalWarnings++;
                if (!isArrayLen) structuralErrors++;
            }
        }
    }

    // Summary
    console.log('');
    if (totalWarnings === 0) {
        console.log(`✓ All ${langs.length} languages match EN structure (${refPages.length} pages each)`);
    } else {
        const arrayWarnings = totalWarnings - structuralErrors;
        if (structuralErrors > 0) {
            console.log(`✗ ${structuralErrors} structural error(s) (missing keys/pages)`);
        }
        if (arrayWarnings > 0) {
            console.log(`⚠ ${arrayWarnings} array length difference(s) (reviews, tips, etc.)`);
        }
    }

    // Only fail on structural errors (missing keys/pages), not array length diffs
    return structuralErrors;
}

const warnings = validate();
process.exit(warnings > 0 ? 1 : 0);
