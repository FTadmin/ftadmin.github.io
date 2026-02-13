#!/usr/bin/env node
/**
 * Feeltracker Static Site Builder
 *
 * Reads data/ files + HTML templates → generates all static HTML pages.
 * No dependencies — uses only Node.js built-in modules.
 *
 * Usage: node build.js
 *
 * Workflow for adding a new language:
 *   1. Add the language config to data/languages.json
 *   2. Create data/{lang}/pages.json with translated page entries
 *   3. Run: node build.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Template Engine
// ============================================================

/**
 * Convert inline markdown to HTML (no paragraph wrapping).
 * Supports: **bold**, [text](url)
 * Links get target="_blank" rel="noopener" automatically.
 */
function markdownInline(md) {
    if (!md || typeof md !== 'string') return md || '';
    let text = md;
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Single newlines → <br>
    text = text.replace(/\n/g, '<br>');
    return text;
}

/**
 * Convert block markdown to HTML (with paragraph wrapping).
 * Supports: **bold**, [text](url), paragraphs (double newline), ## headings
 */
function markdownToHtml(md) {
    if (!md || typeof md !== 'string') return md || '';
    const paragraphs = md.split(/\n{2,}/);
    return paragraphs.map(p => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('### ')) return '<h3>' + markdownInline(p.slice(4)) + '</h3>';
        if (p.startsWith('## ')) return '<h2>' + markdownInline(p.slice(3)) + '</h2>';
        return '<p>' + markdownInline(p) + '</p>';
    }).filter(Boolean).join('\n');
}

/**
 * Resolve a dot-notation path against an object.
 * e.g. resolve(ctx, "meta.title") → ctx.meta.title
 */
function resolve(obj, keyPath) {
    if (!keyPath || obj == null) return undefined;
    return keyPath.split('.').reduce((o, k) => (o != null) ? o[k] : undefined, obj);
}

function isTruthy(value) {
    if (Array.isArray(value)) return value.length > 0;
    return !!value;
}

/**
 * Find the matching closing tag for a block, handling nesting.
 * Returns { content, end } where end is the position after the closing tag.
 */
function findClosingTag(template, startPos, tagName) {
    let depth = 1;
    let pos = startPos;
    const openPattern = '{{#' + tagName;
    const closeTag = '{{/' + tagName + '}}';

    while (depth > 0 && pos < template.length) {
        const nextOpen = template.indexOf(openPattern, pos);
        const nextClose = template.indexOf(closeTag, pos);

        if (nextClose === -1) {
            throw new Error(`Missing closing ${closeTag} (started at pos ${startPos})`);
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            pos = nextOpen + openPattern.length;
        } else {
            depth--;
            if (depth === 0) {
                return {
                    content: template.slice(startPos, nextClose),
                    end: nextClose + closeTag.length
                };
            }
            pos = nextClose + closeTag.length;
        }
    }
    throw new Error(`Missing closing ${closeTag}`);
}

/**
 * Find the matching {{/if}} for an {{#if}}, with optional {{else}}.
 * Handles nested {{#if}} blocks correctly.
 */
function findIfBlock(template, startPos) {
    let depth = 1;
    let pos = startPos;
    let elsePos = -1;

    while (pos < template.length) {
        const nextIf = template.indexOf('{{#if ', pos);
        const nextElse = template.indexOf('{{else}}', pos);
        const nextEndif = template.indexOf('{{/if}}', pos);

        const candidates = [];
        if (nextIf !== -1) candidates.push({ type: 'if', pos: nextIf });
        if (nextElse !== -1) candidates.push({ type: 'else', pos: nextElse });
        if (nextEndif !== -1) candidates.push({ type: 'endif', pos: nextEndif });
        candidates.sort((a, b) => a.pos - b.pos);

        if (candidates.length === 0) {
            throw new Error('Missing {{/if}}');
        }

        const next = candidates[0];

        if (next.type === 'if') {
            depth++;
            pos = next.pos + 6; // skip past '{{#if '
        } else if (next.type === 'else' && depth === 1) {
            elsePos = next.pos;
            pos = next.pos + 8; // skip past '{{else}}'
        } else if (next.type === 'else') {
            pos = next.pos + 8;
        } else { // endif
            depth--;
            if (depth === 0) {
                const endPos = next.pos + 7; // skip past '{{/if}}'
                if (elsePos !== -1) {
                    return {
                        ifContent: template.slice(startPos, elsePos),
                        elseContent: template.slice(elsePos + 8, next.pos),
                        end: endPos
                    };
                }
                return {
                    ifContent: template.slice(startPos, next.pos),
                    elseContent: null,
                    end: endPos
                };
            }
            pos = next.pos + 7;
        }
    }
    throw new Error('Missing {{/if}}');
}

/**
 * Render a template string with the given data context.
 *
 * Supported syntax:
 *   {{variable}}          - insert value (dot notation: {{a.b.c}})
 *   {{#each array}}       - loop over array; item props available directly
 *   {{/each}}
 *   {{#if variable}}      - conditional block
 *   {{else}}              - optional else branch
 *   {{/if}}
 *   {{> partialName}}     - include a partial template
 *   {{json variable}}     - output JSON.stringify'd value
 *   {{@ variable}}        - raw output (same as {{}}, kept for clarity)
 */
function render(template, data, partials) {
    partials = partials || {};
    let pos = 0;
    let output = '';

    while (pos < template.length) {
        const tagStart = template.indexOf('{{', pos);
        if (tagStart === -1) {
            output += template.slice(pos);
            break;
        }

        // Add text before the tag
        output += template.slice(pos, tagStart);

        const tagEnd = template.indexOf('}}', tagStart);
        if (tagEnd === -1) {
            output += template.slice(tagStart);
            break;
        }

        const tag = template.slice(tagStart + 2, tagEnd).trim();
        const afterTag = tagEnd + 2;

        if (tag.startsWith('#each ')) {
            // {{#each arrayPath}} ... {{/each}}
            const varName = tag.slice(6).trim();
            const { content, end } = findClosingTag(template, afterTag, 'each');
            const arr = resolve(data, varName);
            if (Array.isArray(arr)) {
                for (let i = 0; i < arr.length; i++) {
                    const item = arr[i];
                    const itemCtx = (typeof item === 'object' && item !== null)
                        ? { ...data, ...item, _parent: data, _index: i, _first: i === 0, _last: i === arr.length - 1 }
                        : { ...data, _value: item, _parent: data, _index: i, _first: i === 0, _last: i === arr.length - 1 };
                    output += render(content, itemCtx, partials);
                }
            }
            pos = end;

        } else if (tag.startsWith('#if ')) {
            // {{#if varPath}} ... {{else}} ... {{/if}}
            const varName = tag.slice(4).trim();
            const block = findIfBlock(template, afterTag);
            const value = resolve(data, varName);
            if (isTruthy(value)) {
                output += render(block.ifContent, data, partials);
            } else if (block.elseContent) {
                output += render(block.elseContent, data, partials);
            }
            pos = block.end;

        } else if (tag.startsWith('> ')) {
            // {{> partialName}} - include partial
            const partialName = tag.slice(2).trim();
            const partial = partials[partialName];
            if (partial) {
                output += render(partial, data, partials);
            } else {
                console.warn(`  Warning: partial "${partialName}" not found`);
            }
            pos = afterTag;

        } else if (tag.startsWith('md ')) {
            // {{md varPath}} - render block markdown to HTML (with <p> wrapping)
            const varName = tag.slice(3).trim();
            const value = resolve(data, varName);
            output += markdownToHtml(value != null ? String(value) : '');
            pos = afterTag;

        } else if (tag.startsWith('mdi ')) {
            // {{mdi varPath}} - render inline markdown to HTML (no <p> wrapping)
            const varName = tag.slice(4).trim();
            const value = resolve(data, varName);
            output += markdownInline(value != null ? String(value) : '');
            pos = afterTag;

        } else if (tag.startsWith('json ')) {
            // {{json varPath}} - output as formatted JSON
            const varName = tag.slice(5).trim();
            const value = resolve(data, varName);
            if (value !== undefined) {
                output += JSON.stringify(value, null, 6);
            }
            pos = afterTag;

        } else {
            // {{varPath}} - simple variable substitution
            const value = resolve(data, tag);
            output += (value != null) ? String(value) : '';
            pos = afterTag;
        }
    }

    return output;
}

// ============================================================
// Build Logic
// ============================================================

const ROOT = __dirname;
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const PARTIALS_DIR = path.join(TEMPLATES_DIR, 'partials');
const DATA_DIR = path.join(ROOT, 'data');

function loadPartials() {
    const partials = {};
    if (fs.existsSync(PARTIALS_DIR)) {
        for (const file of fs.readdirSync(PARTIALS_DIR)) {
            if (file.endsWith('.html')) {
                const name = path.basename(file, '.html');
                partials[name] = fs.readFileSync(path.join(PARTIALS_DIR, file), 'utf8');
            }
        }
    }
    return partials;
}

function loadTemplates() {
    const templates = {};
    for (const file of fs.readdirSync(TEMPLATES_DIR)) {
        if (file.endsWith('.html')) {
            const name = path.basename(file, '.html');
            templates[name] = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
        }
    }
    return templates;
}

/**
 * Build the full context object for rendering a page.
 * Merges: site globals + language data + page-specific data
 */
function buildContext(site, languages, page) {
    const lang = languages[page.lang];
    const pagePath = page.path || '';

    // Build language switcher entries
    const langSwitcher = Object.keys(languages).map(code => {
        const l = languages[code];
        let url;
        if (pagePath === '') {
            url = code === Object.keys(languages)[0] ? '/' : l.prefix + '/';
        } else {
            url = (l.prefix || '') + '/' + pagePath + '/';
        }
        return {
            code,
            name: l.name,
            flag: l.flag,
            url,
            fullUrl: site.url + url,
            isCurrent: code === page.lang
        };
    });

    // Build nav app links with "current" marker
    const navApps = (lang.nav && lang.nav.apps) ? lang.nav.apps.map(app => ({
        ...app,
        url: (lang.prefix || '') + '/' + app.slug + '/',
        isCurrent: app.slug === page.slug
    })) : [];

    // Footer home link
    const footerHomeUrl = pagePath === ''
        ? ((lang.prefix || '') + '/' || '/')
        : (lang.prefix || '') + '/' + pagePath + '/';

    // Brand logo URL
    const brandUrl = lang.prefix ? lang.prefix + '/' : '/';

    // Canonical URL
    const canonicalUrl = site.url + ((lang.prefix || '') + '/' + (pagePath ? pagePath + '/' : ''));

    // x-default URL (English version)
    const enLang = languages[Object.keys(languages)[0]];
    const xDefaultUrl = site.url + '/' + (pagePath ? pagePath + '/' : '');

    // Privacy URL for this language
    const privacyUrl = (lang.prefix || '') + '/privacy/';

    return {
        site,
        lang,
        langPrefix: lang.prefix || '',
        currency: lang.currency,
        langSwitcher,
        navApps,
        brandUrl,
        footerHomeUrl,
        canonicalUrl,
        xDefaultUrl,
        footer: lang.footer,
        cookie: lang.cookie,
        privacyUrl,
        ...page.data
    };
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function build() {
    console.log('Feeltracker Site Builder');
    console.log('========================\n');

    // Load data from split files
    if (!fs.existsSync(DATA_DIR)) {
        console.error('ERROR: data/ directory not found. Run extract.js first or create data files manually.');
        process.exit(1);
    }
    const site = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'site.json'), 'utf8'));
    const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

    // Load all per-language page files
    const pages = [];
    for (const entry of fs.readdirSync(DATA_DIR)) {
        const pagesFile = path.join(DATA_DIR, entry, 'pages.json');
        if (fs.statSync(path.join(DATA_DIR, entry)).isDirectory() && fs.existsSync(pagesFile)) {
            const langPages = JSON.parse(fs.readFileSync(pagesFile, 'utf8'));
            pages.push(...langPages);
        }
    }

    // Load templates and partials
    const templates = loadTemplates();
    const partials = loadPartials();

    console.log(`Templates: ${Object.keys(templates).join(', ')}`);
    console.log(`Partials:  ${Object.keys(partials).join(', ')}`);
    console.log(`Pages:     ${pages.length}\n`);

    let built = 0;
    let errors = 0;

    for (const page of pages) {
        const template = templates[page.template];
        if (!template) {
            console.error(`  ✗ ${page.outputPath} — template "${page.template}" not found`);
            errors++;
            continue;
        }

        try {
            const context = buildContext(site, languages, page);
            const html = render(template, context, partials);
            const outputFile = path.join(ROOT, page.outputPath);
            ensureDir(outputFile);
            fs.writeFileSync(outputFile, html);
            console.log(`  ✓ ${page.outputPath}`);
            built++;
        } catch (err) {
            console.error(`  ✗ ${page.outputPath} — ${err.message}`);
            errors++;
        }
    }

    console.log(`\nDone! Built ${built} pages.${errors ? ' ' + errors + ' error(s).' : ''}`);
    if (errors) process.exit(1);
}

build();
