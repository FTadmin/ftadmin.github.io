# Feeltracker Static Site — Build System Guide

## Architecture Overview

All HTML pages are generated from `data/` JSON files + HTML templates (16 pages per language).
**Never edit the HTML files directly** — they are overwritten on every build.

```
data/
  site.json          ← Global config (URLs, GTM/GA IDs, author)
  languages.json     ← Per-language config (nav, footer, cookie, flag)
  en/pages.json      ← All 16 English page entries
  de/pages.json      ← All 16 German page entries
  es/pages.json      ← All 16 Spanish page entries
  fr/pages.json      ← All 16 French page entries
  it/pages.json      ← All 16 Italian page entries
templates/           ← HTML templates with {{mustache}} syntax
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

### data/{lang}/pages.json
Array of page entries:
```json
[
  { "template": "app-page", "lang": "en", "slug": "blood-pressure",
    "path": "blood-pressure", "outputPath": "blood-pressure/index.html",
    "data": { ... } }
]
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
- `reviews` — title, subtitle + items array (title, content, author)
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
- `reviews` — title, subtitle, items[]
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
1. Open `data/en/pages.json` (or any language)
2. Find the page by `slug` (e.g., `"slug": "blood-pressure"`)
3. Edit the field (e.g., `data.features.items[2].description`)
4. Run `node build.js`

### Add a new tip to a tips page
1. Find the tips page in `data/en/pages.json` (e.g., `"slug": "blood-pressure"`, template `"tips-page"`)
2. Add to the appropriate `tipCategories[].tips[]` array:
   ```json
   { "icon": "fas fa-icon-name", "title": "21. New Tip Title", "content": "Tip text with <a href=\"url\">links</a> supported." }
   ```
3. Do the same in every other language's `pages.json`
4. Run `node validate.js && node build.js`

### Add a new FAQ item
1. Find the page in the relevant `data/{lang}/pages.json`
2. Add to `data.faq.items[]`:
   ```json
   { "question": "New question?", "answer": "<p>Answer with <strong>HTML</strong> supported.</p>" }
   ```
3. Add to all languages, then run `node validate.js && node build.js`

### Add a new review
1. Find the page in `data/{lang}/pages.json`
2. Add to `data.reviews.items[]`:
   ```json
   { "title": "Review Title", "content": "Review text without quotes", "author": "Username, App Name" }
   ```
3. Run `node build.js`

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
2. **Create pages data:** Copy `data/en/pages.json` → `data/pt/pages.json`
3. **Update all page entries** in `data/pt/pages.json`:
   - Set `"lang": "pt"` on every page entry
   - Update `"path"` (e.g., `"pt/blood-pressure"`) and `"outputPath"` (e.g., `"pt/blood-pressure/index.html"`)
   - Translate all `data` fields
4. **Translate everything** — common things to miss:
   - `cta.items[].name` and `cta.items[].downloadAlt` on the **index page** (the app names above download buttons, e.g., "Pressão Arterial Feeltracker")
   - `apps.items[].downloadAlt` on the index page
   - `indexFooter` content on the index page
   - All `meta` fields (title, description, keywords, OG tags)
5. **Use absolute image paths** — all `iconSrc` values must start with `/` (e.g., `/images/BPT_1024.png`, not `images/BPT_1024.png`), otherwise images break in language subdirectories
6. **Update `sitemap.xml`:**
   - Add a new `<url>` entry for every page in the new language (16 total)
   - Add `<xhtml:link rel="alternate" hreflang="pt" href="..."/>` to **every existing** `<url>` entry across all languages
7. **Update `robots.txt`:** Add the new language to the "Available in" comment
8. **Update `llms.txt`:** Add the new language to the Languages section with its URL
9. **Validate and build:** Run `node validate.js && node build.js`

### Add a new app
1. Add the app to `nav.apps[]` for each language in `data/languages.json`
2. Add page entries to each `data/{lang}/pages.json`: app page + tips page
3. Run `node validate.js && node build.js`

### Delete a page
1. Remove the page entry from each `data/{lang}/pages.json`
2. Run `node build.js` (note: build won't delete old files, remove them manually)
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
- Utility pages (about, privacy, terms, faq, support) use raw HTML `bodyContent` — edit the HTML directly in the pages.json for these pages
