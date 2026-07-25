#!/usr/bin/env node
//
// verify-translation.js — did the fan-out actually land, and did it survive?
//
// validate.js checks that every locale has the same SHAPE as EN. This checks
// the translated STRINGS themselves, which is a different question and the one
// that has actually bitten:
//
//   structural — the HTML tag sequence and every href must match EN exactly.
//                Catches a dropped <strong> around a legal claim, a mangled
//                link, a lost list item. An agent has reported "OK" while
//                silently dropping a <strong> pair.
//
//   staleness  — a string identical to EN was never translated. AND, for a
//                purely textual EN edit (a number, a date, a retention period),
//                structural checks CANNOT tell current from stale: the old
//                translation has the same tags, the same hrefs, and is still
//                != EN, so everything passes on stale content. Pass --expect
//                to assert the new value is actually present.
//
// Usage:
//   node verify-translation.js <file.json> <path> [<path> ...]
//   node verify-translation.js privacy.utility.json data.intro data.sections.11.content
//
//   # textual change: assert each locale really carries the new value
//   node verify-translation.js privacy.utility.json data.sections.12.content \
//        --expect 'data.sections.12.content=/30|٣٠|۳۰|๓๐/'
//
// Exits 1 if anything fails, so it chains: verify && validate && build.

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const expects = [];
const positional = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--expect') {
        const spec = argv[++i] || '';
        const eq = spec.indexOf('=');
        if (eq === -1) {
            console.error(`--expect needs <path>=/regex/ or <path>=<count>x/regex/, got: ${spec}`);
            process.exit(2);
        }
        const p = spec.slice(0, eq);
        let rest = spec.slice(eq + 1);
        // optional "3x" prefix = minimum number of matches (default 1)
        let min = 1;
        const m = rest.match(/^(\d+)x(.*)$/);
        if (m) { min = parseInt(m[1], 10); rest = m[2]; }
        const body = rest.replace(/^\/|\/$/g, '');
        expects.push({ path: p, re: new RegExp(body, 'g'), min, src: rest });
    } else {
        positional.push(argv[i]);
    }
}

const [file, ...paths] = positional;
if (!file || (!paths.length && !expects.length)) {
    console.error('usage: node verify-translation.js <file.json> <path> [...] [--expect <path>=/regex/]');
    process.exit(2);
}

const get = (obj, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
const tags = (s) => (String(s).match(/<\/?\w+/g) || []).join(',');
const hrefs = (s) => (String(s).match(/href="[^"]+"/g) || []).join(',');
const strip = (s) => String(s).replace(/<[^>]+>/g, '');

const enPath = path.join('data', 'en', file);
if (!fs.existsSync(enPath)) {
    console.error(`no such EN file: ${enPath}`);
    process.exit(2);
}
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const locales = fs.readdirSync('data')
    .filter((l) => l !== 'en' && fs.existsSync(path.join('data', l, file)))
    .sort();

let failed = 0;
for (const l of locales) {
    const doc = JSON.parse(fs.readFileSync(path.join('data', l, file), 'utf8'));
    const bad = [];

    for (const p of paths) {
        const e = get(en, p);
        const v = get(doc, p);
        if (v === undefined) { bad.push(`${p}: MISSING`); continue; }
        if (tags(v) !== tags(e)) bad.push(`${p}: tag sequence differs from EN`);
        if (hrefs(v) !== hrefs(e)) bad.push(`${p}: href differs from EN`);
        if (String(v).trim() === String(e).trim()) bad.push(`${p}: still English`);
    }

    for (const x of expects) {
        const v = get(doc, x.path);
        if (v === undefined) { bad.push(`${x.path}: MISSING`); continue; }
        const n = (strip(v).match(x.re) || []).length;
        if (n < x.min) bad.push(`${x.path}: expected >=${x.min} match of ${x.src}, found ${n} (stale?)`);
    }

    if (bad.length) { failed++; console.log(`✗ ${l}\n    ${bad.join('\n    ')}`); }
}

const checks = paths.length + expects.length;
if (failed) {
    console.log(`\n✗ ${failed} of ${locales.length} locale(s) failed (${checks} check(s) each)`);
    process.exit(1);
}
console.log(`✓ ${locales.length} locales x ${checks} check(s) — tags, hrefs, not-English${expects.length ? ', expected values present' : ''}`);
