#!/usr/bin/env node
/**
 * Build compact translation jobs from English source files.
 *
 * Why: large full-file prompts are token-heavy. This script deduplicates repeated
 * strings and outputs stable IDs + references so each unique source text is
 * translated once per language and reused everywhere.
 *
 * Usage:
 *   node prepare-translation-jobs.js
 *
 * Output:
 *   translation-jobs/en-strings.json  (unique source strings + refs)
 *   translation-jobs/by-file/*.json   (per-file IDs only)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const EN_DIR = path.join(ROOT, 'data', 'en');
const OUT_DIR = path.join(ROOT, 'translation-jobs');
const OUT_BY_FILE = path.join(OUT_DIR, 'by-file');

const SKIP_FIELDS = new Set([
    'structuredDataHtml',
    'bodyContent',
    'christmasHtml',
    'christmasBannerHtml',
    'doctorEndorsementHtml',
    'customCss',
    'santaScript',
    'canonicalUrl',
    'path',
    'outputPath',
    'slug',
    'template',
    'lang',
    'appId',
    'url',
    'src',
    'image',
    'imageAlt',
    'icon',
    'flag',
    'currency'
]);

function isProbablyTranslatable(key, value) {
    if (typeof value !== 'string') return false;
    if (SKIP_FIELDS.has(key)) return false;

    const text = value.trim();
    if (!text) return false;

    if (/^\/?images\//.test(text) || /^https?:\/\//.test(text) || /^mailto:/.test(text)) {
        return false;
    }

    // Skip template/css/js-like chunks.
    if (/[{}<>]/.test(text) && /<(script|style|section|div|svg)/i.test(text)) return false;

    return /[\p{L}\p{N}]/u.test(text);
}

function hashText(text) {
    return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);
}

function walk(value, pathParts, collector) {
    if (Array.isArray(value)) {
        value.forEach((item, idx) => walk(item, [...pathParts, String(idx)], collector));
        return;
    }
    if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            walk(v, [...pathParts, k], collector);
        }
        return;
    }

    const key = pathParts[pathParts.length - 1] || '';
    if (!isProbablyTranslatable(key, value)) return;

    const text = value.trim();
    collector(text, pathParts.join('.'));
}

function ensureDirs() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(OUT_BY_FILE, { recursive: true });
}

function run() {
    if (!fs.existsSync(EN_DIR)) {
        console.error('Missing data/en directory');
        process.exit(1);
    }

    ensureDirs();

    const fileNames = fs.readdirSync(EN_DIR).filter((f) => f.endsWith('.json')).sort();

    const byId = new Map();
    const perFile = {};

    for (const fileName of fileNames) {
        const abs = path.join(EN_DIR, fileName);
        const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
        const ids = new Set();

        walk(json, [], (text, refPath) => {
            const id = `t_${hashText(text)}`;
            ids.add(id);

            if (!byId.has(id)) {
                byId.set(id, {
                    id,
                    source: text,
                    refs: [{ file: fileName, path: refPath }]
                });
            } else {
                byId.get(id).refs.push({ file: fileName, path: refPath });
            }
        });

        perFile[fileName] = [...ids].sort();
    }

    const strings = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    const summary = {
        generatedAt: new Date().toISOString(),
        sourceLanguage: 'en',
        files: fileNames.length,
        uniqueStrings: strings.length,
        repeatedStrings: strings.filter((s) => s.refs.length > 1).length,
        strings
    };

    fs.writeFileSync(path.join(OUT_DIR, 'en-strings.json'), JSON.stringify(summary, null, 2) + '\n');

    for (const [fileName, ids] of Object.entries(perFile)) {
        const payload = {
            file: fileName,
            sourceLanguage: 'en',
            stringIds: ids
        };
        fs.writeFileSync(path.join(OUT_BY_FILE, fileName), JSON.stringify(payload, null, 2) + '\n');
    }

    console.log(`Wrote ${strings.length} unique strings from ${fileNames.length} EN files.`);
    console.log(`Output: ${path.relative(ROOT, OUT_DIR)}/`);
}

run();
