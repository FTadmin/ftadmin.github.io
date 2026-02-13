# Feeltracker Static Site — Build System Guide

## Architecture Overview

All 48 HTML pages are generated from a single `data.json` file + HTML templates.
**Never edit the HTML files directly** — they are overwritten on every build.

```
data.json          ← All content (text, meta tags, structured data)
templates/         ← HTML templates with {{mustache}} syntax
  app-page.html    ← Product pages (blood-pressure, sleep, weight, etc.)
  tips-page.html   ← Tips pages (20 tips per app)
  index-page.html  ← Homepage (hero, apps grid, features, reviews, etc.)
  utility-page.html← About, privacy, terms, faq, support (raw HTML body)
  partials/        ← Shared components
    nav.html       ← Navigation bar with language selector
    footer.html    ← Footer links, copyright, disclaimer
    cookie-consent.html
    analytics-head.html
    head-assets.html
build.js           ← Node.js build script (zero dependencies)
extract.js         ← One-time migration tool (extracts data from existing HTML)
```

## Quick Commands

```bash
node build.js      # Regenerate all 48 HTML pages from data.json
node extract.js    # Re-extract data.json from existing HTML (migration only)
```

## data.json Structure

```
{
  "site": { url, name, author, copyrightYear, gtmId, gaId, awId },
  "languages": {
    "en": { code, name, flag, prefix, currency, nav: { apps: [...] }, footer: {...}, cookie: {...} },
    "de": { ... },
    "es": { ... }
  },
  "pages": [
    { template, lang, slug, path, outputPath, appId?, data: { ... } }
  ]
}
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
1. Open `data.json`
2. Find the page by `slug` and `lang` (e.g., `slug: "blood-pressure"`, `lang: "en"`)
3. Edit the field (e.g., `data.features.items[2].description`)
4. Run `node build.js`

### Add a new tip to a tips page
1. Find the tips page in `data.json` (e.g., `path: "blood-pressure/tips"`, `lang: "en"`)
2. Add to the appropriate `tipCategories[].tips[]` array:
   ```json
   { "icon": "fas fa-icon-name", "title": "21. New Tip Title", "content": "Tip text with <a href=\"url\">links</a> supported." }
   ```
3. Do the same for DE and ES translations
4. Run `node build.js`

### Add a new FAQ item
1. Find the page in `data.json`
2. Add to `data.faq.items[]`:
   ```json
   { "question": "New question?", "answer": "<p>Answer with <strong>HTML</strong> supported.</p>" }
   ```
3. Run `node build.js`

### Add a new review
1. Find the page in `data.json`
2. Add to `data.reviews.items[]`:
   ```json
   { "title": "Review Title", "content": "Review text without quotes", "author": "Username, App Name" }
   ```
3. Run `node build.js`

### Add a new language (e.g., French)
1. Add language config to `data.json` under `languages`:
   ```json
   "fr": {
     "code": "fr", "name": "Français", "flag": "🇫🇷", "prefix": "/fr", "currency": "EUR",
     "nav": { "apps": [{ "name": "Tension Artérielle", "slug": "blood-pressure" }, ...] },
     "footer": { "home": "Accueil", "about": "À propos", ... },
     "cookie": { "title": "Paramètres des Cookies", ... }
   }
   ```
2. Duplicate each EN page entry in the `pages` array, set `lang: "fr"`, update `path` (e.g., `"fr/blood-pressure"`), `outputPath` (e.g., `"fr/blood-pressure/index.html"`), and translate all `data` fields
3. Run `node build.js` — new HTML files are created automatically

### Add a new app
1. Add the app to `nav.apps[]` for each language in `languages`
2. Add page entries for each language: app page, tips page
3. Run `node build.js`

### Delete a page
1. Remove the page entry from `data.json` `pages` array
2. Run `node build.js` (note: build won't delete old files, remove them manually)
3. `rm path/to/old/index.html`

## Template Syntax

The build system uses a custom mustache-like template engine:

| Syntax | Purpose | Example |
|--------|---------|---------|
| `{{variable}}` | Output value | `{{meta.title}}` |
| `{{#each array}}...{{/each}}` | Loop | `{{#each features.items}}` |
| `{{#if value}}...{{/if}}` | Conditional | `{{#if hero.badge}}` |
| `{{#if value}}...{{else}}...{{/if}}` | If/else | |
| `{{> partialName}}` | Include partial | `{{> nav}}` |
| `{{json object}}` | Output as JSON | `{{json structuredData}}` |

Inside `{{#each}}` blocks, properties of the current item are available directly (e.g., `{{title}}`, `{{icon}}`).

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
- **extract.js is for migration only** — don't run it on built files (it reads originals)
- If you need to re-extract, first restore originals: `git checkout <commit> -- <files>`
- The build does NOT delete old files — remove manually when deleting pages
- Tips and index pages have NO shared footer partial — tips pages have no footer at all, index pages have a custom footer stored in `indexFooter`
- Utility pages (about, privacy, terms, faq, support) use raw HTML `bodyContent` — edit the HTML directly in data.json for these pages
