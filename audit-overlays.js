#!/usr/bin/env node
// Audit non-EN overlay files for structural-field leaks.
// A "leak" is an overlay key whose value at the same JSON path in EN matches
// a structural pattern (FA class, image/URL path, numeric ID, JS code).
// Keys with matching names but translatable EN values (e.g. a label named
// "appStoreId" with value "App Store ID") are NOT flagged.
// Usage: node audit-overlays.js [--fix]

const fs = require('fs');
const path = require('path');

const FIX = process.argv.includes('--fix');

// Per-key patterns that identify a structural value in EN.
// If EN's value at the same path matches, an overlay copy of it is a leak.
const STRUCTURAL_PATTERNS = {
    icon:         v => typeof v === 'string' && /^(fa[bsr]? fa-|icon-)/.test(v),
    src:          v => typeof v === 'string' && /^(\/|https?:\/\/)/.test(v),
    image:        v => typeof v === 'string' && /^(\/|https?:\/\/)/.test(v),
    ogImage:      v => typeof v === 'string' && /^(\/|https?:\/\/)/.test(v),
    iconSrc:      v => typeof v === 'string' && /^(\/|https?:\/\/)/.test(v),
    appStoreUrl:  v => typeof v === 'string' && /^https?:\/\//.test(v),
    appId:        v => typeof v === 'string' && /^\d+$/.test(v),
    appStoreId:   v => typeof v === 'string' && /^\d+$/.test(v),
    santaScript:  v => typeof v === 'string' && v.length > 0,
};

const STRUCTURAL_KEYS = new Set(Object.keys(STRUCTURAL_PATTERNS));

const dataDir = path.join(__dirname, 'data');
const enDir = path.join(dataDir, 'en');

// Load every EN file so we can look up values by path.
const enFiles = {};
for (const f of fs.readdirSync(enDir).filter(f => f.endsWith('.json'))) {
    enFiles[f] = JSON.parse(fs.readFileSync(path.join(enDir, f), 'utf8'));
}

function getByPath(obj, parts) {
    let cur = obj;
    for (const p of parts) {
        if (cur === null || cur === undefined) return undefined;
        cur = cur[p];
    }
    return cur;
}

const langs = fs.readdirSync(dataDir)
    .filter(d => fs.statSync(path.join(dataDir, d)).isDirectory())
    .filter(d => d !== 'en');

const findings = [];

function walk(node, pathParts, enRoot, onHit) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, [...pathParts, i], enRoot, onHit));
        return;
    }
    for (const key of Object.keys(node)) {
        if (STRUCTURAL_KEYS.has(key)) {
            // Check EN's value at the same path
            const enValue = getByPath(enRoot, [...pathParts, key]);
            if (STRUCTURAL_PATTERNS[key](enValue)) {
                onHit([...pathParts, key], node[key], enValue);
                // Don't recurse into a leaked field — it's getting deleted
                continue;
            }
        }
        walk(node[key], [...pathParts, key], enRoot, onHit);
    }
}

function deleteByPath(obj, parts) {
    if (parts.length === 0) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (cur === null || cur === undefined) return;
        cur = cur[parts[i]];
    }
    if (cur && typeof cur === 'object') {
        delete cur[parts[parts.length - 1]];
    }
}

for (const lang of langs.sort()) {
    const langDir = path.join(dataDir, lang);
    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const fp = path.join(langDir, file);
        const raw = fs.readFileSync(fp, 'utf8');
        let doc;
        try { doc = JSON.parse(raw); } catch (e) {
            findings.push({ lang, file, error: `JSON parse error: ${e.message}` });
            continue;
        }
        const enDoc = enFiles[file];
        if (!enDoc) {
            findings.push({ lang, file, error: 'No matching EN file' });
            continue;
        }
        const hits = [];
        walk(doc, [], enDoc, (p, v, enV) => hits.push({ path: p.slice(), value: v, enValue: enV }));
        if (hits.length > 0) {
            findings.push({ lang, file, hits });
            if (FIX) {
                for (const h of hits) deleteByPath(doc, h.path);
                fs.writeFileSync(fp, JSON.stringify(doc, null, 2) + '\n');
            }
        }
    }
}

if (findings.length === 0) {
    console.log('Clean: no structural-field leaks in any overlay.');
    process.exit(0);
}

console.log(`Found ${findings.length} overlay file(s) with structural-field leaks:\n`);
let totalHits = 0;
for (const f of findings) {
    if (f.error) {
        console.log(`  ${f.lang}/${f.file}: ${f.error}`);
        continue;
    }
    totalHits += f.hits.length;
    console.log(`  ${f.lang}/${f.file} (${f.hits.length} leak${f.hits.length === 1 ? '' : 's'}):`);
    for (const h of f.hits) {
        const fmt = v => typeof v === 'string'
            ? JSON.stringify(v.length > 50 ? v.slice(0, 50) + '…' : v)
            : JSON.stringify(v);
        console.log(`    ${h.path.join('.')} = ${fmt(h.value)}   (EN: ${fmt(h.enValue)})`);
    }
}

console.log(`\nTotal: ${totalHits} leak(s) across ${findings.filter(f => !f.error).length} file(s).`);
if (FIX) {
    console.log(`✓ Stripped. Run \`node validate.js && node build.js\` next.`);
} else {
    console.log(`Run with --fix to strip these fields.`);
}
