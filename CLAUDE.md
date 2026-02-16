# Feeltracker Static Site — Build System Guide

## Architecture Overview

All HTML pages are generated from `data/` JSON files + HTML templates (16 pages per language).
**Never edit the HTML files directly** — they are overwritten on every build.

```
data/
  site.json                    ← Global config (URLs, GTM/GA IDs, author)
  languages.json               ← Per-language config (nav, footer, cookie, flag)
  en/                          ← English page files (1 file per page)
    blood-pressure.app.json    ← App page: Blood Pressure
    blood-pressure.tips.json   ← Tips page: Blood Pressure
    sleep.app.json             ← App page: Sleep
    sleep.tips.json            ← Tips page: Sleep
    ...                        ← (5 app + 5 tips + 5 utility + 1 index = 16 files)
    about.utility.json         ← Utility page: About
    index.json                 ← Homepage
  de/                          ← German (same 16 files, translated)
  es/                          ← Spanish
  fr/                          ← French
  it/                          ← Italian
  ru/                          ← Russian
templates/                     ← HTML templates with {{mustache}} syntax
  app-page.html      ← Product pages (blood-pressure, sleep, weight, etc.)
  tips-page.html     ← Tips pages (20 tips per app)
  index-page.html    ← Homepage (hero, apps grid, features, reviews, etc.)
  utility-page.html  ← About, privacy, terms, faq, support (raw HTML body)
  partials/          ← Shared components
    nav.html         ← Navigation bar with language selector
    footer.html      ← Footer links, copyright, disclaimer
    cookie-consent.html
    analytics-head.html
    head-assets.html
build.js             ← Node.js build script (zero dependencies)
validate.js          ← Checks structural parity across languages (EN = reference)
extract.js           ← One-time migration tool (extracts data from existing HTML)
split-pages.js       ← One-time migration tool (splits pages.json into per-page files)
```

## Quick Commands

```bash
node build.js        # Regenerate all HTML pages from data/ files
node validate.js     # Check all languages match EN structure
node extract.js      # Re-extract data from existing HTML (migration only)
```

## Data File Structure

### data/site.json
```json
{ "url": "...", "name": "...", "author": "...", "copyrightYear": "...", "gtmId": "...", "gaId": "...", "awId": "..." }
```

### data/languages.json
```json
{
  "en": { "code": "en", "name": "English", "flag": "🇺🇸", "prefix": "",
          "nav": { "apps": [...] }, "footer": {...}, "cookie": {...} },
  "de": { ... }, "es": { ... }, "fr": { ... }, "it": { ... }
}
```

### data/{lang}/ — Individual Page Files

Each page is a separate JSON file. Naming convention: `{slug}.{type}.json`

| File pattern | Template | Example |
|---|---|---|
| `{slug}.app.json` | app-page | `blood-pressure.app.json` |
| `{slug}.tips.json` | tips-page | `blood-pressure.tips.json` |
| `{slug}.utility.json` | utility-page | `about.utility.json` |
| `index.json` | index-page | `index.json` |

Each file is a single page object:
```json
{ "template": "app-page", "lang": "en", "slug": "blood-pressure",
  "path": "blood-pressure", "outputPath": "blood-pressure/index.html",
  "data": { ... } }
```

## Page Types and Their Data

### App Pages (`template: "app-page"`)
Fully structured. Each section is a JSON object:
- `meta` — title, description, keywords, OG tags
- `hero` — image, title, badge, privacy text, subtitle, CTA
- `screenshots` — title + items array
- `features` — title + items array (icon, title, description)
- `howItWorks` — title, subtitle + steps array
- `aiFeatures` — free + premium arrays
- `benefits` — title, subtitle + items array
- `languages` — title, text
- `useCases` — (optional) title + items array
- `faq` — title + items array (question, answer with HTML)
- `reviews` — title, subtitle, disclaimer (non-EN only) + items array (title, content, author)
- `tips` — title, subtitle, ctaText
- `cta` — title, subtitle

### Tips Pages (`template: "tips-page"`)
Fully structured:
- `meta`, `structuredDataHtml`, `appId`, `conversionEvent`
- `hero` — image, imageAlt, title, subtitle
- `tipCategories[]` — each has `title` + `tips[]` (icon, title, content with HTML links)
- `cta` — title, subtitle, appStoreUrl, buttonAlt, platformInfo
- `customCss` — inline CSS for tip card styling

### Index/Homepage (`template: "index-page"`)
Fully structured:
- `meta`, `structuredDataHtml`
- `christmasHtml`, `christmasBannerHtml` — commented-out seasonal features
- `hero` — logo, title, subtitle, stats[], privacyText, featureBadges[]
- `apps` — title + items[] (slug, iconSrc, title, subtitle, badge, description, features[], learnMoreText, appStoreId, downloadAlt)
- `features` — title + items[] (icon, title, description)
- `aiFeatures` — title, subtitle, freeTitle, free[], premiumTitle, premium[], disclaimerTitle, disclaimerText
- `socialProof` — title, subtitle, stats[]
- `reviews` — title, subtitle, disclaimer (non-EN only), items[]
- `platforms` — title, subtitle, text
- `faq` — title + items[] (question, answer)
- `cta` — title, subtitle, items[] (name, appStoreId, downloadAlt)
- `indexFooter` — links[], copyright, tagline, disclaimer
- `santaScript` — raw JS for Christmas feature
- `doctorEndorsementHtml` — commented-out endorsement section

### Utility Pages (`template: "utility-page"`)
Use raw HTML in `bodyContent` field (about, privacy, terms, faq, support):
- `meta`, `structuredDataHtml`
- `bodyContent` — raw HTML between nav and footer

## Common Tasks

### Edit existing text (e.g., change a feature description)
1. Open the page file directly, e.g., `data/en/blood-pressure.app.json`
2. Edit the field (e.g., `data.features.items[2].description`)
3. Run `node build.js`

### Add a new tip to a tips page
1. Open `data/en/blood-pressure.tips.json` (or the relevant `{slug}.tips.json`)
2. Add to the appropriate `tipCategories[].tips[]` array:
   ```json
   { "icon": "fas fa-icon-name", "title": "21. New Tip Title", "content": "Tip text with <a href=\"url\">links</a> supported." }
   ```
3. Do the same in every other language's matching file (e.g., `data/de/blood-pressure.tips.json`)
4. Run `node validate.js && node build.js`

### Add a new FAQ item
1. Open the page file, e.g., `data/en/blood-pressure.app.json`
2. Add to `data.faq.items[]`:
   ```json
   { "question": "New question?", "answer": "<p>Answer with <strong>HTML</strong> supported.</p>" }
   ```
3. Do the same in every other language's matching file, then run `node validate.js && node build.js`

### Add a new review
1. Open the page file, e.g., `data/en/blood-pressure.app.json`
2. Add to `data.reviews.items[]`:
   ```json
   { "title": "Review Title", "content": "Review text without quotes", "author": "Username, App Name" }
   ```
3. **Translate the review** into every non-EN language's matching file. Keep `author` names unchanged (real usernames). Each non-EN language must have a `reviews.disclaimer` field (see below).
4. Run `node build.js`

### Add a new language (e.g., Portuguese)
1. **Add language config** to `data/languages.json`:
   ```json
   "pt": {
     "code": "pt", "name": "Português", "flag": "🇵🇹", "prefix": "/pt", "currency": "EUR",
     "nav": { "apps": [{ "name": "Pressão Arterial", "slug": "blood-pressure" }, ...] },
     "footer": { "home": "Início", "about": "Sobre", ... },
     "cookie": { "title": "Valorizamos a sua privacidade", ... }
   }
   ```
2. **Create page files:** Copy all `data/en/*.json` files to `data/pt/` (16 files)
3. **Update every page file** in `data/pt/`:
   - Set `"lang": "pt"` in each file
   - Keep `"path"` the same as EN (e.g., `"blood-pressure"`, NOT `"pt/blood-pressure"`)
   - Update `"outputPath"` to add language prefix (e.g., `"pt/blood-pressure/index.html"`)
   - Translate all `data` fields
4. **Translate everything** — CRITICAL fields that are frequently missed on the **index page**:
   - **`apps.items[].title`** — the app name shown in the apps grid (e.g., "Pressão Arterial Feeltracker"). These MUST be translated, not left in English.
   - **`apps.items[].downloadAlt`** — alt text for download buttons in the apps grid
   - **`cta.items[].name`** — the app name shown above download buttons in the CTA section at the bottom of the page (e.g., "Pressão Arterial Feeltracker"). These MUST be translated.
   - **`cta.items[].downloadAlt`** — alt text for download buttons in the CTA section
   - **`indexFooter.links[].href`** — MUST use absolute paths with language prefix (e.g., `"/pt/about/"`, `"/pt/privacy/"`). Never use relative paths like `about.html` — they break on non-root pages. For EN, use `"/about/"`, `"/privacy/"`, etc.
   - **`indexFooter`** content (links, copyright, tagline, disclaimer)
   - All `meta` fields (title, description, keywords, OG tags)
   - All `structuredDataHtml` text content
   - **`reviews.items[]`** — all review `title` and `content` fields MUST be translated. Keep `author` names unchanged (real usernames). Add a `reviews.disclaimer` field in the target language stating reviews were translated from English (e.g., `"Les avis ont été traduits de l'anglais. Publiés à l'origine sur l'App Store."`)
5. **Use absolute image paths** — all `iconSrc` values must start with `/` (e.g., `/images/BPT_1024.png`, not `images/BPT_1024.png`), otherwise images break in language subdirectories
   - **Utility page `bodyContent`** — the FAQ page contains `<img src="...">` tags with relative paths. EN uses `../images/` (one level up from `/faq/`), but non-EN languages are two levels deep (`/{lang}/faq/`) so they MUST use `../../images/`. When copying from EN, always fix these relative paths. Preferred: use absolute paths like `/images/add_new.jpg`.
6. **Update `sitemap.xml`:**
   - Add a new `<url>` entry for every page in the new language (16 total)
   - Add `<xhtml:link rel="alternate" hreflang="pt" href="..."/>` to **every existing** `<url>` entry across all languages
7. **Update `robots.txt`:** Add the new language to the "Available in" comment
8. **Update `llms.txt`:** Add the new language to the Languages section with its URL
9. **Validate and build:** Run `node validate.js && node build.js`

### Translation tips and common pitfalls
These lessons were learned from the Simplified Chinese (zh) translation and apply to all future translations:

1. **JSON escaping** — Translated text often contains quotation marks (e.g., AI says "your data shows..."). ASCII double quotes (`"`) inside JSON string values MUST be escaped as `\"`, or use the language's native quotation marks (e.g., Chinese `\u201C...\u201D`, French `«...»`, German `„..."`) which don't need escaping.
2. **The `howItWorks` steps** are the most error-prone fields — they contain long markdown content with embedded examples using quotes. Always verify these parse as valid JSON after translation.
3. **Utility pages (`bodyContent`)** contain raw HTML strings that can be thousands of characters long on a single JSON line. Special characters in the translated HTML (unescaped quotes, backslashes) will break JSON parsing. After writing utility page files, always validate with `node -e "JSON.parse(require('fs').readFileSync('data/{lang}/file.json','utf8'))"`.
4. **Quick JSON validation for all files in a language:**
   ```bash
   for f in data/{lang}/*.json; do node -e "try { JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK: $f'); } catch(e) { console.log('ERROR: $f: ' + e.message); }"; done
   ```
5. **Sitemap update script** — For adding a new language's hreflang to all existing entries, use a Node.js script rather than manual editing. The sitemap has 2500+ lines and every `<url>` entry needs a new `<xhtml:link>` for the new language.
6. **Reviews disclaimer** — Every non-EN language MUST include `"disclaimer"` in the reviews section of app pages AND the index page, stating reviews were translated from English (e.g., Chinese: `"评论翻译自英文原文。最初发布在App Store上。"`).
7. **Current languages** (10 total): English (en), Deutsch (de), Español (es), Français (fr), Italiano (it), Русский (ru), 日本語 (ja), 한국어 (ko), Português Brasil (pt-br), 简体中文 (zh)

### Add a new app
1. Add the app to `nav.apps[]` for each language in `data/languages.json`
2. Create `{slug}.app.json` and `{slug}.tips.json` in each `data/{lang}/` directory
3. Run `node validate.js && node build.js`

### Delete a page
1. Delete the page file from each `data/{lang}/` directory (e.g., `rm data/*/sleep.app.json`)
2. Run `node build.js` (note: build won't delete old HTML files, remove them manually)
3. `rm path/to/old/index.html`

## Validation

`validate.js` uses EN as the reference language and checks all other languages for:
- **Same page set** — every slug+template in EN must exist in each language
- **Same data structure** — matching keys and nested object shapes
- **Array length differences** — shown as warnings (not errors), since languages may legitimately differ (e.g., more reviews in EN)

Structural errors (missing keys/pages) exit with code 1. Array length warnings exit with code 0.

## Template Syntax

The build system uses a custom mustache-like template engine:

| Syntax | Purpose | Example |
|--------|---------|---------|
| `{{variable}}` | Output value (raw) | `{{meta.title}}` |
| `{{md variable}}` | Markdown → HTML (block, with `<p>` wrapping) | `{{md answer}}` |
| `{{mdi variable}}` | Markdown → HTML (inline, no `<p>`) | `{{mdi description}}` |
| `{{#each array}}...{{/each}}` | Loop | `{{#each features.items}}` |
| `{{#if value}}...{{/if}}` | Conditional | `{{#if hero.badge}}` |
| `{{#if value}}...{{else}}...{{/if}}` | If/else | |
| `{{> partialName}}` | Include partial | `{{> nav}}` |
| `{{json object}}` | Output as JSON | `{{json structuredData}}` |

Inside `{{#each}}` blocks, properties of the current item are available directly (e.g., `{{title}}`, `{{icon}}`).

### Markdown in Data Fields

Translatable content fields use markdown instead of raw HTML. The build converts at render time:

| Markdown | HTML output |
|----------|-------------|
| `**bold text**` | `<strong>bold text</strong>` |
| `[link text](url)` | `<a href="url" target="_blank" rel="noopener">link text</a>` |
| Double newline | New `<p>` paragraph (block mode only) |
| Single newline | `<br>` (inline mode only) |
| `## Heading` | `<h2>Heading</h2>` (block mode only) |
| `### Heading` | `<h3>Heading</h3>` (block mode only) |

**When to use which tag:**
- `{{md field}}` — for standalone content that needs paragraph wrapping (FAQ answers, how-it-works steps)
- `{{mdi field}}` — for content inside an existing `<p>` or `<li>` tag (descriptions, feature text, tips)
- `{{field}}` — for raw output: plain text, raw HTML blobs (`structuredDataHtml`, `bodyContent`), or values in attributes

**Fields using markdown:** FAQ answers, tip content, feature descriptions, howItWorks step content, app descriptions, footer copyright. These fields store content like:
```json
"answer": "Your data syncs via iCloud. This means **no email** or personal info needed. See our [privacy policy](https://feeltracker.com/privacy/)."
```

**Fields that stay as raw HTML:** `structuredDataHtml`, `bodyContent`, `christmasHtml`, `customCss`, `santaScript`, `doctorEndorsementHtml`, `disclaimerTitle`

## Build Context

When a page is rendered, the template receives a merged context containing:
- `site` — global site config
- `lang` — current language config
- `langPrefix` — e.g., `""` for EN, `"/de"` for DE
- `currency` — from language config
- `langSwitcher[]` — all languages with URLs for current page
- `navApps[]` — navigation apps with `isCurrent` flag
- `brandUrl`, `footerHomeUrl`, `canonicalUrl`, `xDefaultUrl`, `privacyUrl`
- `footer`, `cookie` — from language config
- All fields from `page.data` (spread at top level)

## Important Notes

- **Never edit HTML files** — they are regenerated by `node build.js`
- **Always run `node validate.js`** before building after structural changes
- **extract.js is for migration only** — don't run it on built files (it reads originals)
- If you need to re-extract, first restore originals: `git checkout <commit> -- <files>`
- The build does NOT delete old files — remove manually when deleting pages
- Tips and index pages have NO shared footer partial — tips pages have no footer at all, index pages have a custom footer stored in `indexFooter`
- Utility pages (about, privacy, terms, faq, support) use raw HTML `bodyContent` — edit the HTML directly in the `.utility.json` files
