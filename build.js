#!/usr/bin/env node
/**
 * Feeltracker Static Site Builder
 *
 * Reads data/ files + HTML templates → generates all static HTML pages.
 * No dependencies — uses only Node.js built-in modules.
 *
 * Usage: node build.js
 *
 * Data layout: each page is a separate JSON file in data/{lang}/
 *   e.g., data/en/blood-pressure.app.json, data/de/index.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashFile(p) {
    if (!fs.existsSync(p)) return '';
    return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8);
}
const assetVersion = {
    shared: hashFile('shared.css'),
    game:   hashFile('game.css'),
    nav:    hashFile('nav.js'),
};

// ============================================================
// Template Engine
// ============================================================

/**
 * Read PNG/JPEG dimensions without any dependencies.
 * Returns { width, height } or null if not recognised / not found.
 */
function getImageDimensions(localPath) {
    if (!fs.existsSync(localPath)) return null;
    const buf = fs.readFileSync(localPath);
    // PNG: 8-byte signature + 4-byte IHDR length + "IHDR" + width(4) + height(4) big-endian
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: scan markers
    if (buf.length >= 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
        let i = 2;
        while (i < buf.length) {
            if (buf[i] !== 0xFF) break;
            const marker = buf[i + 1];
            // SOF markers (baseline/progressive): 0xC0..0xCF except 0xC4/0xC8/0xCC
            if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
                return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
            }
            i += 2 + buf.readUInt16BE(i + 2);
        }
    }
    return null;
}

const imageDimCache = {};
function resolveOgImageDims(ogImage, siteUrl) {
    if (!ogImage) return null;
    if (imageDimCache[ogImage] !== undefined) return imageDimCache[ogImage];
    let localPath = null;
    if (siteUrl && ogImage.startsWith(siteUrl + '/')) {
        localPath = path.join(ROOT, ogImage.slice(siteUrl.length + 1));
    } else if (ogImage.startsWith('/')) {
        localPath = path.join(ROOT, ogImage.slice(1));
    }
    const dims = localPath ? getImageDimensions(localPath) : null;
    imageDimCache[ogImage] = dims;
    return dims;
}

/**
 * Strip markdown to plain text (for JSON-LD schema where HTML isn't allowed).
 */
function stripMarkdown(md) {
    if (!md || typeof md !== 'string') return md || '';
    return md
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\n+/g, ' ')
        .trim();
}

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

const RELATED_APPS_TITLE = {
    en: 'Explore our other apps',
    de: 'Entdecken Sie unsere anderen Apps',
    es: 'Descubre nuestras otras aplicaciones',
    fr: 'Découvrez nos autres applications',
    'fr-ca': 'Découvrez nos autres applications',
    it: 'Scopri le nostre altre app',
    ru: 'Откройте для себя другие наши приложения',
    ja: '他のアプリもチェック',
    ko: '다른 앱 둘러보기',
    'pt-br': 'Conheça nossos outros aplicativos',
    pt: 'Conheça as nossas outras aplicações',
    'zh-Hans': '探索我们的其他应用',
    'zh-Hant': '探索我們的其他應用程式',
    sv: 'Utforska våra andra appar',
    nb: 'Utforsk våre andre apper',
    da: 'Udforsk vores andre apps',
    fi: 'Tutustu muihin sovelluksiimme',
    nl: 'Ontdek onze andere apps',
    pl: 'Odkryj nasze inne aplikacje',
    cs: 'Prozkoumejte naše další aplikace',
    sk: 'Preskúmajte naše ďalšie aplikácie',
    ro: 'Descoperă celelalte aplicații ale noastre',
    hr: 'Istražite naše druge aplikacije',
    hu: 'Fedezze fel többi alkalmazásunkat',
    uk: 'Відкрийте для себе наші інші додатки',
    ar: 'استكشف تطبيقاتنا الأخرى',
    he: 'גלו את האפליקציות האחרות שלנו',
    el: 'Ανακαλύψτε τις άλλες εφαρμογές μας',
    tr: 'Diğer uygulamalarımızı keşfedin',
    th: 'สำรวจแอปอื่นๆ ของเรา',
    vi: 'Khám phá các ứng dụng khác của chúng tôi',
    ca: 'Descobreix les nostres altres aplicacions'
};

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
 * Convert a language code to proper BCP 47 format.
 * Region subtags (2-letter, e.g., 'br' in 'pt-br') become uppercase.
 * Script subtags (4-letter, e.g., 'Hans' in 'zh-Hans') stay as-is.
 */
function toBcp47(code) {
    return code.replace(/-([a-zA-Z]{2})$/, (_, region) => '-' + region.toUpperCase());
}

/**
 * Build the full context object for rendering a page.
 * Merges: site globals + language data + page-specific data
 */
function buildContext(site, languages, page, appCatalog) {
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
            hreflang: toBcp47(code),
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

    // og:locale mapping
    const ogLocaleMap = {
        'en':'en_US','de':'de_DE','es':'es_ES','it':'it_IT','ru':'ru_RU','ja':'ja_JP',
        'fr':'fr_FR','ko':'ko_KR','pt-br':'pt_BR','zh-Hans':'zh_CN','sv':'sv_SE',
        'nb':'nb_NO','da':'da_DK','fi':'fi_FI','ar':'ar_AR','ca':'ca_ES','cs':'cs_CZ',
        'el':'el_GR','fr-ca':'fr_CA','he':'he_IL','hr':'hr_HR','hu':'hu_HU','nl':'nl_NL',
        'pl':'pl_PL','pt':'pt_PT','ro':'ro_RO','sk':'sk_SK','th':'th_TH','tr':'tr_TR',
        'uk':'uk_UA','vi':'vi_VN','zh-Hant':'zh_TW'
    };
    const ogLocale = ogLocaleMap[page.lang] || 'en_US';

    // Generate structuredDataHtml from structuredData JSON array (if present)
    const data = { ...page.data };

    // Auto-detect og:image dimensions for social card meta tags
    if (data.meta && data.meta.ogImage && !data.meta.ogImageWidth) {
        const dims = resolveOgImageDims(data.meta.ogImage, site.url);
        if (dims) {
            data.meta = { ...data.meta, ogImageWidth: dims.width, ogImageHeight: dims.height };
        }
    }

    // Auto-generate SEO schemas from page content where missing
    data.structuredData = Array.isArray(data.structuredData) ? [...data.structuredData] : [];

    // FAQPage schema — from data.faq.items (if not already present)
    if (data.faq && Array.isArray(data.faq.items) && data.faq.items.length > 0) {
        const hasFAQ = data.structuredData.some(b => b && b['@type'] === 'FAQPage');
        if (!hasFAQ) {
            data.structuredData.push({
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: data.faq.items.map(item => ({
                    '@type': 'Question',
                    name: stripMarkdown(item.question),
                    acceptedAnswer: {
                        '@type': 'Answer',
                        text: stripMarkdown(item.answer)
                    }
                }))
            });
        }
    }

    // Review items — inject into the first SoftwareApplication/MobileApplication block
    if (data.reviews && Array.isArray(data.reviews.items) && data.reviews.items.length > 0) {
        const appBlock = data.structuredData.find(b =>
            b && (b['@type'] === 'SoftwareApplication' || b['@type'] === 'MobileApplication')
        );
        if (appBlock && !appBlock.review) {
            appBlock.review = data.reviews.items.map(item => ({
                '@type': 'Review',
                reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5 },
                author: { '@type': 'Person', name: (item.author || '').split(',')[0].trim() || 'Anonymous' },
                name: item.title,
                reviewBody: item.content
            }));
        }
    }

    // BreadcrumbList — tips pages get Home > {App} > Tips
    if (page.template === 'tips-page' && page.slug) {
        const hasBreadcrumb = data.structuredData.some(b => b && b['@type'] === 'BreadcrumbList');
        if (!hasBreadcrumb) {
            const langPrefix = lang.prefix || '';
            const homeUrl = site.url + (langPrefix ? langPrefix + '/' : '/');
            const appUrl = site.url + langPrefix + '/' + page.slug + '/';
            const tipsUrl = site.url + langPrefix + '/' + page.slug + '/tips/';
            const navApp = (lang.nav && lang.nav.apps) ? lang.nav.apps.find(a => a.slug === page.slug) : null;
            const appName = navApp ? navApp.name : page.slug;
            const tipsLabel = (data.hero && data.hero.title) ? data.hero.title : 'Tips';
            data.structuredData.push({
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: homeUrl },
                    { '@type': 'ListItem', position: 2, name: appName, item: appUrl },
                    { '@type': 'ListItem', position: 3, name: tipsLabel, item: tipsUrl }
                ]
            });
        }
    }

    // Related apps — cross-link from app pages to the other apps
    if (page.template === 'app-page' && appCatalog && lang.nav && lang.nav.apps) {
        const langPrefix = lang.prefix || '';
        data.relatedApps = lang.nav.apps
            .filter(a => a.slug !== page.slug && appCatalog[a.slug])
            .map(a => ({
                slug: a.slug,
                name: a.name,
                url: langPrefix + '/' + a.slug + '/',
                iconSrc: appCatalog[a.slug].iconSrc,
                appId: appCatalog[a.slug].appId
            }));
        data.relatedAppsTitle = RELATED_APPS_TITLE[page.lang] || RELATED_APPS_TITLE.en;
    }

    if (data.structuredData.length > 0 && !data.structuredDataHtml) {
        data.structuredDataHtml = data.structuredData.map(block =>
            '    <script type="application/ld+json">\n' +
            JSON.stringify(block, null, 6).split('\n').map(line => '    ' + line).join('\n') +
            '\n    </script>'
        ).join('\n');
    }

    const hasGame = typeof data.santaScript === 'string' && data.santaScript.trim().length > 0;

    return {
        site,
        lang,
        htmlLang: toBcp47(page.lang),
        langPrefix: lang.prefix || '',
        langSwitcher,
        navApps,
        brandUrl,
        footerHomeUrl,
        canonicalUrl,
        xDefaultUrl,
        footer: lang.footer,
        cookie: lang.cookie,
        privacyUrl,
        ogLocale,
        hasGame,
        assetVersion,
        ...data
    };
}

/**
 * Deep-merge a base object with an overlay object.
 * - Objects: overlay keys override base keys, recurse for nested objects
 * - Arrays: positional merge (item 0 with item 0, etc.), uses longer array
 * - Scalars: overlay wins
 * - undefined in overlay: use base value
 * - null in overlay: explicitly set to null
 */
function deepMerge(base, overlay) {
    if (overlay === undefined) return base;
    if (overlay === null) return null;
    if (typeof base !== 'object' || base === null) return overlay;
    if (typeof overlay !== 'object') return overlay;

    if (Array.isArray(base) && Array.isArray(overlay)) {
        // Overlay array length wins — if translation has 6 reviews, keep 6
        // (don't pad with untranslated EN items)
        // Within each item, deep merge to fill in structural fields from base
        const result = [];
        for (let i = 0; i < overlay.length; i++) {
            if (i < base.length) {
                result.push(deepMerge(base[i], overlay[i]));
            } else {
                result.push(overlay[i]);
            }
        }
        return result;
    }
    if (Array.isArray(base) !== Array.isArray(overlay)) {
        console.warn('  Warning: type mismatch in deepMerge (array vs object), overlay wins');
        return overlay;
    }

    const result = { ...base };
    for (const key of Object.keys(overlay)) {
        result[key] = deepMerge(base[key], overlay[key]);
    }
    return result;
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

    // Load EN pages first (they are the structural base for all languages)
    const REF_LANG = 'en';
    const enDir = path.join(DATA_DIR, REF_LANG);
    const enPagesByFile = {};
    for (const file of fs.readdirSync(enDir)) {
        if (!file.endsWith('.json')) continue;
        const page = JSON.parse(fs.readFileSync(path.join(enDir, file), 'utf8'));
        enPagesByFile[file] = page;
    }

    // Build app catalog (slug → { iconSrc, appId }) from EN .app.json files
    // for cross-linking between related app pages
    const appCatalog = {};
    for (const [file, page] of Object.entries(enPagesByFile)) {
        if (!file.endsWith('.app.json')) continue;
        appCatalog[page.slug] = {
            slug: page.slug,
            iconSrc: page.data && page.data.hero && page.data.hero.image,
            appId: page.appId || (page.data && page.data.appId)
        };
    }

    // Load all per-language page files
    // Non-EN files without a "template" field are translation overlays — deep-merge with EN base
    const pages = Object.values(enPagesByFile); // start with EN pages
    for (const entry of fs.readdirSync(DATA_DIR)) {
        if (entry === REF_LANG) continue; // already loaded
        const langDir = path.join(DATA_DIR, entry);
        if (!fs.statSync(langDir).isDirectory()) continue;
        const langConfig = languages[entry];
        if (!langConfig) continue; // skip unknown directories

        for (const file of fs.readdirSync(langDir)) {
            if (!file.endsWith('.json')) continue;
            const raw = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8'));

            if (raw.template) {
                // Legacy complete file — use as-is (backward compatibility)
                pages.push(raw);
            } else {
                // Translation overlay — merge with EN base
                const enPage = enPagesByFile[file];
                if (!enPage) {
                    console.warn(`  Warning: ${entry}/${file} has no matching EN base file, skipping`);
                    continue;
                }
                const mergedData = deepMerge(enPage.data, raw.data || {});
                const langPrefix = langConfig.prefix || '';
                const enPath = enPage.path || '';
                const outputPath = enPath
                    ? `${entry}/${enPath}/index.html`
                    : `${entry}/index.html`;
                pages.push({
                    template: enPage.template,
                    lang: entry,
                    slug: enPage.slug,
                    path: enPage.path,
                    outputPath,
                    appId: enPage.appId,
                    data: mergedData
                });
            }
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
            const context = buildContext(site, languages, page, appCatalog);
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
