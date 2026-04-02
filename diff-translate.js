#!/usr/bin/env node
/**
 * diff-translate.js — Extract changed translatable strings from EN files.
 *
 * Compares EN source files against the last git commit and outputs a compact
 * translation manifest containing only the fields that changed.  This lets
 * translation agents work on a tiny patch instead of the full file, making
 * translations fast and predictable.
 *
 * Usage:
 *   node diff-translate.js                              # all changed EN files
 *   node diff-translate.js data/en/blood-pressure.app.json  # one file
 *
 * Output (stdout): JSON manifest like:
 *   {
 *     "files": {
 *       "blood-pressure.app.json": {
 *         "changes": [
 *           { "path": "data.hero.subtitle", "old": "...", "new": "..." },
 *           { "path": "data.features.items.2.description", "old": null, "new": "..." }
 *         ]
 *       }
 *     },
 *     "summary": { "filesChanged": 1, "stringsChanged": 3 }
 *   }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const EN_DIR = path.join(ROOT, 'data', 'en');

// Fields that are structural (never translated) — skip these in diffs.
const STRUCTURAL_FIELDS = new Set([
    'template', 'lang', 'slug', 'path', 'outputPath', 'appId',
    'icon', 'src', 'image', 'ogImage', 'appStoreId', 'appStoreUrl',
    'iconSrc', 'customCss', 'santaScript', 'structuredDataHtml',
    'christmasHtml', 'christmasBannerHtml', 'doctorEndorsementHtml',
    'conversionEvent', 'canonicalUrl', 'flag', 'currency'
]);

// Fields whose values are never human-readable text.
function isNonTranslatable(key, value) {
    if (STRUCTURAL_FIELDS.has(key)) return true;
    if (typeof value !== 'string') return true;
    const v = value.trim();
    if (!v) return true;
    if (/^\/?images\//.test(v) || /^https?:\/\//.test(v) || /^mailto:/.test(v)) return true;
    if (/[{}<>]/.test(v) && /<(script|style|section|div|svg)/i.test(v)) return true;
    if (!/[\p{L}\p{N}]/u.test(v)) return true;
    return false;
}

/**
 * Flatten a JSON object into { "dotted.path": value } for leaf strings only.
 * Skips structural/non-translatable fields.
 */
function flattenTranslatable(obj, prefix) {
    const result = {};
    if (Array.isArray(obj)) {
        obj.forEach((item, i) => {
            const sub = flattenTranslatable(item, `${prefix}.${i}`);
            Object.assign(result, sub);
        });
    } else if (obj && typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            if (STRUCTURAL_FIELDS.has(k) && prefix.split('.').length <= 2) continue;
            const sub = flattenTranslatable(v, prefix ? `${prefix}.${k}` : k);
            Object.assign(result, sub);
        }
    } else if (typeof obj === 'string') {
        const key = prefix.split('.').pop();
        if (!isNonTranslatable(key, obj)) {
            result[prefix] = obj;
        }
    }
    return result;
}

/**
 * Get the committed version of a file from git HEAD.
 * Returns null if the file is new (untracked/not in HEAD).
 */
function getGitVersion(filePath) {
    const rel = path.relative(ROOT, filePath);
    try {
        const content = execSync(`git show HEAD:${rel}`, {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return JSON.parse(content);
    } catch {
        return null;
    }
}

/**
 * Determine which EN files have been modified since last commit.
 */
function getChangedENFiles() {
    try {
        // Staged + unstaged changes in data/en/
        const diffOutput = execSync(
            'git diff HEAD --name-only -- data/en/',
            { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        const stagedOutput = execSync(
            'git diff --cached --name-only -- data/en/',
            { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        // Untracked files
        const untrackedOutput = execSync(
            'git ls-files --others --exclude-standard -- data/en/',
            { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();

        const files = new Set();
        for (const output of [diffOutput, stagedOutput, untrackedOutput]) {
            if (output) {
                output.split('\n').forEach(f => files.add(f.trim()));
            }
        }
        return [...files].filter(f => f.endsWith('.json')).sort();
    } catch {
        return [];
    }
}

function run() {
    let targetFiles;

    if (process.argv[2]) {
        // Specific file(s) passed as arguments.
        targetFiles = process.argv.slice(2).map(f => path.relative(ROOT, path.resolve(f)));
    } else {
        // Auto-detect changed EN files.
        targetFiles = getChangedENFiles();
        if (targetFiles.length === 0) {
            console.log(JSON.stringify({ files: {}, summary: { filesChanged: 0, stringsChanged: 0 } }, null, 2));
            return;
        }
    }

    const manifest = { files: {} };
    let totalStrings = 0;

    for (const relPath of targetFiles) {
        const absPath = path.join(ROOT, relPath);
        const fileName = path.basename(relPath);

        if (!fs.existsSync(absPath)) {
            console.error(`File not found: ${relPath}`);
            continue;
        }

        const currentJSON = JSON.parse(fs.readFileSync(absPath, 'utf8'));
        const oldJSON = getGitVersion(absPath);

        const currentFlat = flattenTranslatable(currentJSON, '');
        const oldFlat = oldJSON ? flattenTranslatable(oldJSON, '') : {};

        const changes = [];

        // Find changed or added strings.
        for (const [dotPath, newVal] of Object.entries(currentFlat)) {
            const oldVal = oldFlat[dotPath];
            if (oldVal === undefined) {
                changes.push({ path: dotPath, old: null, new: newVal });
            } else if (oldVal !== newVal) {
                changes.push({ path: dotPath, old: oldVal, new: newVal });
            }
        }

        // Find removed strings.
        for (const [dotPath, oldVal] of Object.entries(oldFlat)) {
            if (currentFlat[dotPath] === undefined) {
                changes.push({ path: dotPath, old: oldVal, new: null });
            }
        }

        if (changes.length > 0) {
            manifest.files[fileName] = { changes };
            totalStrings += changes.length;
        }
    }

    manifest.summary = {
        filesChanged: Object.keys(manifest.files).length,
        stringsChanged: totalStrings
    };

    console.log(JSON.stringify(manifest, null, 2));
}

run();
