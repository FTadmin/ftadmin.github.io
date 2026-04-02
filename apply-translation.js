#!/usr/bin/env node
/**
 * apply-translation.js — Patch overlay files with translated strings.
 *
 * Takes a translation patch (JSON on stdin or file arg) and applies it to
 * one or more language overlay files.  Used by translation agents to make
 * targeted updates without rewriting entire overlay files.
 *
 * Usage:
 *   # Apply a patch from stdin:
 *   echo '{"lang":"de","file":"blood-pressure.app.json","translations":[{"path":"data.hero.subtitle","value":"Neuer Text"}]}' | node apply-translation.js
 *
 *   # Apply a patch file:
 *   node apply-translation.js patch-de.json
 *
 *   # Apply patches for multiple languages:
 *   node apply-translation.js patches/*.json
 *
 * Patch format (single language):
 *   {
 *     "lang": "de",
 *     "file": "blood-pressure.app.json",
 *     "translations": [
 *       { "path": "data.hero.subtitle", "value": "Translated text" },
 *       { "path": "data.features.items.2.description", "value": "..." }
 *     ]
 *   }
 *
 * Patch format (multiple languages in one file):
 *   [
 *     { "lang": "de", "file": "...", "translations": [...] },
 *     { "lang": "es", "file": "...", "translations": [...] }
 *   ]
 *
 * What it does:
 *   1. Reads the existing overlay file (or creates a new one with just {"data":{}})
 *   2. For each translation, sets the value at the dotted path
 *   3. If a translation has "value": null, removes that path (for deleted strings)
 *   4. Writes the updated overlay file back
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');

/**
 * Set a value at a dotted path in an object, creating intermediate
 * objects/arrays as needed.  Path segments that are numeric create arrays.
 */
function setAtPath(obj, dottedPath, value) {
    // Strip leading "data." since overlays always nest under "data"
    const parts = dottedPath.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        const nextKey = parts[i + 1];
        const nextIsIndex = /^\d+$/.test(nextKey);

        if (current[key] === undefined || current[key] === null) {
            current[key] = nextIsIndex ? [] : {};
        }
        current = current[key];
    }

    const lastKey = parts[parts.length - 1];
    if (value === null) {
        // Deletion: remove the key.
        if (Array.isArray(current)) {
            // For arrays, set to undefined (will be cleaned up by JSON.stringify)
            current[parseInt(lastKey)] = undefined;
        } else {
            delete current[lastKey];
        }
    } else {
        current[lastKey] = value;
    }
}

/**
 * Get a value at a dotted path, returning undefined if not found.
 */
function getAtPath(obj, dottedPath) {
    const parts = dottedPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Apply a single patch to a language overlay file.
 */
function applyPatch(patch) {
    const { lang, file, translations } = patch;
    if (!lang || !file || !translations) {
        console.error(`Invalid patch: missing lang, file, or translations`);
        return false;
    }

    const overlayPath = path.join(DATA_DIR, lang, file);
    let overlay;

    if (fs.existsSync(overlayPath)) {
        overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
    } else {
        // New overlay file — ensure directory exists.
        fs.mkdirSync(path.join(DATA_DIR, lang), { recursive: true });
        overlay = { data: {} };
    }

    let applied = 0;
    let skipped = 0;

    for (const t of translations) {
        if (!t.path) {
            console.error(`  Skipping translation with no path in ${lang}/${file}`);
            skipped++;
            continue;
        }

        setAtPath(overlay, t.path, t.value);
        applied++;
    }

    fs.writeFileSync(overlayPath, JSON.stringify(overlay, null, 1) + '\n');
    console.log(`${lang}/${file}: applied ${applied} translations${skipped ? `, skipped ${skipped}` : ''}`);
    return true;
}

function run() {
    let patches;

    if (process.argv[2]) {
        // Read from file argument(s).
        patches = [];
        for (const arg of process.argv.slice(2)) {
            const content = fs.readFileSync(arg, 'utf8');
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
                patches.push(...parsed);
            } else {
                patches.push(parsed);
            }
        }
    } else {
        // Read from stdin.
        const input = fs.readFileSync(0, 'utf8');
        const parsed = JSON.parse(input);
        patches = Array.isArray(parsed) ? parsed : [parsed];
    }

    let success = 0;
    let failures = 0;

    for (const patch of patches) {
        if (applyPatch(patch)) {
            success++;
        } else {
            failures++;
        }
    }

    console.log(`\nDone: ${success} patches applied${failures ? `, ${failures} failed` : ''}`);
    process.exit(failures > 0 ? 1 : 0);
}

run();
