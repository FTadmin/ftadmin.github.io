#!/usr/bin/env node
/**
 * One-time migration script: converts non-EN translation files from complete
 * page files to translation-only overlay files.
 *
 * Overlay files contain only translatable text fields. Structural fields
 * (image paths, icon classes, app IDs, etc.) are stripped and inherited
 * from EN at build time via deep-merge.
 *
 * Usage: node migrate-translations.js
 *
 * Safety: This script verifies that the built HTML output is byte-identical
 * before and after migration. It will abort if any differences are found.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const REF_LANG = 'en';

// ============================================================
// Structural field names — these are NEVER translated and will
// be stripped from overlay files. They are inherited from EN.
// ============================================================
const STRUCTURAL_FIELDS = new Set([
    'icon',           // FontAwesome class names (e.g., "fas fa-camera")
    'src',            // image/asset source paths (e.g., "/images/screenshots/bpt-1.png")
    'image',          // icon/hero image paths (e.g., "/images/BPT_1024.png")
    'ogImage',        // Open Graph image URL
    'appId',          // App Store ID (numeric string)
    'appStoreId',     // App Store ID (alternate context)
    'appStoreUrl',    // App Store URL (same across languages)
    'iconSrc',        // app icon paths
    'customCss',      // CSS (not translatable, identical across languages)
    'santaScript',    // JS code (not translatable, identical across languages)
]);
// NOTE: Fields NOT in this list because they differ across languages:
//   slug        — inside data, used as URL paths with language prefix (e.g., "/de/blood-pressure")
//   conversionEvent — contains currency which varies by language
//   christmasHtml, christmasBannerHtml, doctorEndorsementHtml — EN has content, non-EN empty

// Top-level page metadata fields to strip (derived from EN + language)
const TOP_LEVEL_STRIP = new Set([
    'template', 'slug', 'path', 'outputPath', 'appId', 'lang'
]);

/**
 * Recursively strip structural fields from a data object.
 * Returns a new object with only translatable fields, or undefined
 * if the object becomes empty after stripping.
 */
function stripStructural(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => stripStructural(item));
    }

    const result = {};
    let hasKeys = false;
    for (const [key, value] of Object.entries(obj)) {
        if (STRUCTURAL_FIELDS.has(key)) continue;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const stripped = stripStructural(value);
            if (stripped !== undefined && Object.keys(stripped).length > 0) {
                result[key] = stripped;
                hasKeys = true;
            }
        } else if (Array.isArray(value)) {
            result[key] = stripStructural(value);
            hasKeys = true;
        } else {
            result[key] = value;
            hasKeys = true;
        }
    }

    return hasKeys ? result : undefined;
}

/**
 * Compute MD5 checksums of all built index.html files.
 */
function computeChecksums() {
    const checksums = {};
    function walk(dir) {
        for (const entry of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, entry);
            if (entry === '.git' || entry === 'node_modules' || entry === 'data' || entry === 'templates') continue;
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                walk(fullPath);
            } else if (entry === 'index.html') {
                const relPath = path.relative(ROOT, fullPath);
                const content = fs.readFileSync(fullPath);
                checksums[relPath] = crypto.createHash('md5').update(content).digest('hex');
            }
        }
    }
    walk(ROOT);
    return checksums;
}

function migrate() {
    console.log('Translation Migration: Complete Files → Overlay Files');
    console.log('======================================================\n');

    // Step 0: Fix known data bugs in non-EN files before capturing baseline
    // Some files have `path` including the language prefix (e.g., "ru/blood-pressure")
    // which should just be "blood-pressure". Fix these so baseline matches the correct output.
    console.log('Step 0: Fixing known data bugs...');
    const enDirPrecheck = path.join(DATA_DIR, REF_LANG);
    for (const entry of fs.readdirSync(DATA_DIR)) {
        if (entry === REF_LANG) continue;
        const langDir = path.join(DATA_DIR, entry);
        if (!fs.statSync(langDir).isDirectory()) continue;
        for (const file of fs.readdirSync(langDir)) {
            if (!file.endsWith('.json')) continue;
            const filePath = path.join(langDir, file);
            const enFilePath = path.join(enDirPrecheck, file);
            if (!fs.existsSync(enFilePath)) continue;
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const en = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));
            if (raw.path && en.path && raw.path !== en.path) {
                console.log(`  Fixed ${entry}/${file}: path "${raw.path}" → "${en.path}"`);
                raw.path = en.path;
                fs.writeFileSync(filePath, JSON.stringify(raw, null, 2) + '\n');
            }
        }
    }

    // Step 1: Build with fixed files and capture checksums
    console.log('\nStep 1: Building with current files to capture baseline...');
    execSync('node build.js', { cwd: ROOT, stdio: 'pipe' });
    const baselineChecksums = computeChecksums();
    console.log(`  Captured checksums for ${Object.keys(baselineChecksums).length} HTML files\n`);

    // Step 2: Load EN pages indexed by filename
    console.log('Step 2: Loading EN base pages...');
    const enDir = path.join(DATA_DIR, REF_LANG);
    const enPages = {};
    for (const file of fs.readdirSync(enDir)) {
        if (!file.endsWith('.json')) continue;
        enPages[file] = JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8'));
    }
    console.log(`  Loaded ${Object.keys(enPages).length} EN pages\n`);

    // Step 3: Discover non-EN languages
    const langs = fs.readdirSync(DATA_DIR)
        .filter(f => {
            const fullPath = path.join(DATA_DIR, f);
            return fs.statSync(fullPath).isDirectory() && f !== REF_LANG;
        })
        .sort();

    console.log(`Step 3: Migrating ${langs.length} languages...\n`);

    let totalFiles = 0;
    let migratedFiles = 0;
    let skippedFiles = 0;

    // Step 4: Convert each non-EN file to overlay format
    for (const lang of langs) {
        const langDir = path.join(DATA_DIR, lang);
        const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));

        for (const file of files) {
            totalFiles++;
            const filePath = path.join(langDir, file);
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            // Skip files that are already overlay format (no template field)
            if (!raw.template) {
                console.log(`  ⊘ ${lang}/${file} — already overlay format`);
                skippedFiles++;
                continue;
            }

            // Check that matching EN file exists
            if (!enPages[file]) {
                console.warn(`  ⚠ ${lang}/${file} — no matching EN file, keeping as-is`);
                skippedFiles++;
                continue;
            }

            // Strip top-level metadata
            const overlay = {};
            for (const [key, value] of Object.entries(raw)) {
                if (TOP_LEVEL_STRIP.has(key)) continue;
                if (key === 'data') {
                    const strippedData = stripStructural(value);
                    if (strippedData && Object.keys(strippedData).length > 0) {
                        overlay.data = strippedData;
                    }
                }
                // Any other top-level keys besides 'data' and metadata are kept
            }

            // Write the overlay file
            fs.writeFileSync(filePath, JSON.stringify(overlay, null, 2) + '\n');
            migratedFiles++;

            // Report size reduction
            const originalSize = JSON.stringify(raw).length;
            const newSize = JSON.stringify(overlay).length;
            const reduction = Math.round((1 - newSize / originalSize) * 100);
            console.log(`  ✓ ${lang}/${file} — ${reduction}% smaller (${originalSize} → ${newSize} bytes)`);
        }
    }

    console.log(`\n  Migrated: ${migratedFiles}, Skipped: ${skippedFiles}, Total: ${totalFiles}\n`);

    // Step 5: Rebuild with overlay files and verify checksums match
    console.log('Step 5: Rebuilding with overlay files and verifying...');
    execSync('node build.js', { cwd: ROOT, stdio: 'pipe' });
    const newChecksums = computeChecksums();

    // Compare checksums
    let mismatches = 0;
    for (const [file, hash] of Object.entries(baselineChecksums)) {
        if (newChecksums[file] !== hash) {
            console.error(`  ✗ MISMATCH: ${file}`);
            mismatches++;
        }
    }
    for (const file of Object.keys(newChecksums)) {
        if (!baselineChecksums[file]) {
            console.error(`  ✗ NEW FILE: ${file} (not in baseline)`);
            mismatches++;
        }
    }

    if (mismatches > 0) {
        console.error(`\n✗ VERIFICATION: ${mismatches} file(s) differ from baseline.`);
        console.error('  Reverting non-EN data files...');
        for (const lang of langs) {
            execSync(`git checkout -- data/${lang}/`, { cwd: ROOT, stdio: 'pipe' });
        }
        process.exit(1);
    }

    console.log(`  ✓ All ${Object.keys(baselineChecksums).length} HTML files match baseline\n`);
    console.log('Migration complete! All non-EN files are now translation overlays.');
    console.log('Run "node validate.js && node build.js" to double-check.');
}

migrate();
