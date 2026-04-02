# Feeltracker Static Site — Build System Guide

## Architecture Overview

All HTML pages are generated from `data/` JSON files + HTML templates (16 pages per language).
**Never edit the HTML files directly** — they are overwritten on every build.
**Translation/content workflow rule:** edit only JSON source files in `data/` (for example `data/en/*.json`, `data/es/*.json`, `data/languages.json`, `data/site.json`), then run `node build.js` to regenerate webpages.
**Do not manually edit files under language output folders** such as `de/`, `es/`, `fr/`, `zh/`, etc.; those are generated artifacts.

### Translation overlay system

**EN files are the source of truth** — they contain the complete page structure (template, slug, paths, image references, icon classes) plus English text content.

**Non-EN files are translation overlays** — they contain **only translated text fields**. At build time, `build.js` deep-merges the EN base with the translation overlay. Structural fields (images, icons, app IDs, CSS, etc.) are inherited from EN automatically.

This means:
- Adding a structural field (new icon, image, section) only requires editing the EN file
- Non-EN files are much smaller and faster to work with (only text to translate)
- `path`, `template`, `slug`, `outputPath`, `appId`, and `lang` are derived from EN + language config — never put these in non-EN files
- Arrays merge positionally: item 0 in the overlay merges with item 0 from EN, etc.
- The overlay's array length wins — if a language has 6 reviews, only 6 are shown (not padded with EN reviews)

**Structural fields** (stripped from overlays, inherited from EN): `icon`, `src`, `image`, `ogImage`, `appId`, `appStoreId`, `appStoreUrl`, `iconSrc`, `customCss`, `santaScript`

```
data/
  site.json                    ← Global config (URLs, GTM/GA IDs, author)
  languages.json               ← Per-language config (nav, footer, cookie, flag)
  en/                          ← English page files — COMPLETE (structure + text)
    blood-pressure.app.json    ← App page: Blood Pressure
    blood-pressure.tips.json   ← Tips page: Blood Pressure
    sleep.app.json             ← App page: Sleep
    sleep.tips.json            ← Tips page: Sleep
    ...                        ← (5 app + 5 tips + 5 utility + 1 index = 16 files)
    about.utility.json         ← Utility page: About
    index.json                 ← Homepage
  de/                          ← German (16 OVERLAY files, translated text only)
  es/                          ← Spanish
  fr/                          ← French
  it/                          ← Italian
  ru/                          ← Russian
templates/                     ← HTML templates with {{mustache}} syntax
  app-page.html      ← Product pages (blood-pressure, sleep, weight, etc.)
  tips-page.html     ← Tips pages (20 tips per app)
  index-page.html    ← Homepage (hero, apps grid, features, reviews, etc.)
  utility-page.html  ← Legacy template (unused — all utility pages now use dedicated templates)
  about-page.html    ← About page (structured hero + content sections)
  support-page.html  ← Support page (structured contact + apps + resources)
  legal-page.html    ← Privacy and Terms pages (structured intro + sections)
  faq-page.html      ← FAQ page (structured sections/items with markdown)
  partials/          ← Shared components
    nav.html         ← Navigation bar with language selector
    footer.html      ← Footer links, copyright, disclaimer
    cookie-consent.html
    analytics-head.html
    head-assets.html
build.js             ← Node.js build script (zero dependencies)
validate.js          ← Checks structural parity across languages (EN = reference)
diff-translate.js    ← Extracts changed translatable strings from EN files (vs git HEAD)
apply-translation.js ← Patches overlay files with translated strings at specific JSON paths
extract.js           ← One-time migration tool (extracts data from existing HTML)
split-pages.js       ← One-time migration tool (splits pages.json into per-page files)
convert-faq.js       ← One-time migration tool (converts FAQ bodyContent → structured JSON)
convert-support.js   ← One-time migration tool (converts support bodyContent → structured JSON)
convert-legal.js     ← One-time migration tool (converts privacy/terms bodyContent → structured JSON)
convert-about.js     ← One-time migration tool (converts about bodyContent → structured JSON)
convert-structured-data.js ← One-time migration tool (converts structuredDataHtml strings → JSON arrays)
migrate-translations.js ← One-time migration tool (converts complete files → overlay format)
```

## Quick Commands

```bash
node build.js                    # Regenerate all HTML pages from data/ files
node validate.js                 # Check all languages match EN structure
node diff-translate.js           # Show changed translatable strings in all modified EN files
node diff-translate.js data/en/blood-pressure.app.json  # Show changes in one file
node extract.js                  # Re-extract data from existing HTML (migration only)
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
| `about.utility.json` | about-page | `about.utility.json` (structured hero + content sections) |
| `support.utility.json` | support-page | `support.utility.json` (structured contact + apps + resources) |
| `privacy.utility.json` | legal-page | `privacy.utility.json` (structured intro + sections) |
| `terms.utility.json` | legal-page | `terms.utility.json` (structured intro + sections) |
| `faq.utility.json` | faq-page | `faq.utility.json` (structured sections/items with markdown) |
| `index.json` | index-page | `index.json` |

**EN files** are complete page objects with all metadata:
```json
{ "template": "app-page", "lang": "en", "slug": "blood-pressure",
  "path": "blood-pressure", "outputPath": "blood-pressure/index.html",
  "data": { ... } }
```

**Non-EN files** are translation overlays containing only translated text:
```json
{
  "data": {
    "meta": { "title": "Blutdruck...", "description": "..." },
    "hero": { "imageAlt": "...", "title": "Blutdruck", "subtitle": "..." },
    "features": {
      "title": "...",
      "items": [
        { "title": "KI-Kamera-Scan", "description": "..." }
      ]
    }
  }
}
```
No `template`, `slug`, `path`, `outputPath`, `appId`, or `lang` — these are derived from the EN base file. No `icon`, `src`, `image`, or other structural fields — inherited from EN via deep merge.

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
- `meta`, `structuredData`, `appId`, `conversionEvent`
- `hero` — image, imageAlt, title, subtitle
- `tipCategories[]` — each has `title` + `tips[]` (icon, title, content with HTML links)
- `cta` — title, subtitle, appStoreUrl, buttonAlt, platformInfo
- `customCss` — inline CSS for tip card styling

### Index/Homepage (`template: "index-page"`)
Fully structured:
- `meta`, `structuredData`
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

### About Page (`template: "about-page"`)
Structured page with hero section and content sections:
- `meta`, `structuredData` — SEO metadata and JSON-LD schema (array of objects, auto-serialized at build time)
- `hero` — logoText, title, subtitle
- `contentSections[]` — array of section objects, each with `html` (raw HTML for the section content)

Non-EN overlays include: `meta`, `hero` (title, subtitle), and `contentSections[].html` with translated text.

### Support Page (`template: "support-page"`)
Structured page with contact info, app list, and resources:
- `meta`
- `pageTitle` — the `<h1>` heading text
- `contact` — title, supportText (raw HTML), faqText (raw HTML)
- `apps` — title + items[] (name, url, separator, description)
- `resources` — title + items[] (name, url)

Non-EN overlays include: `meta`, `pageTitle`, `contact` (all text), `apps` (title + items), `resources` (title + items). URLs included since they contain language-prefixed paths.

### Legal Pages (`template: "legal-page"`) — Privacy, Terms
Structured pages with intro text and h2-delimited sections:
- `meta`
- `pageTitle` — the `<h1>` heading text
- `intro` — raw HTML for introductory paragraphs
- `sections[]` — array of section objects, each with:
  - `heading` — the h2 section title
  - `content` — raw HTML for section content (paragraphs, lists, links)

### FAQ Page (`template: "faq-page"`)
Structured data with per-question isolation (file: `faq.utility.json`):
- `meta`, `structuredData`
- `pageTitle` — the `<h1>` heading text
- `sections[]` — each section has:
  - `title` — section heading (`null` for the general/first section)
  - `items[]` — array of FAQ items, each with:
    - `question` — plain text (rendered as `<h3>`)
    - `answer` — markdown (rendered with `{{md answer}}`)
    - `images` — optional array of `{src, class}` (absolute `/images/...` paths)
    - `listItems` — optional string array for bullet lists (markdown, rendered with `{{mdi}}`)
    - `listImage` — optional `{src, class}` for an image inside a list
    - `answerAfterList` — optional markdown for text after a list
  - OR `content` — markdown for content-only sections (e.g., Contact Us, no `items`)

## Common Tasks

### Edit existing text (e.g., change a feature description)
1. Edit the EN page file, e.g., `data/en/blood-pressure.app.json`
2. Run `node diff-translate.js` to see exactly which strings changed
3. Propagate to translations — see **Translation Workflow** section for agent strategy
4. Run `node validate.js && node build.js` to validate and regenerate HTML
5. Never patch generated files in language folders directly (`/de/...`, `/es/...`, etc.)

### Add a new tip to a tips page
1. Open `data/en/blood-pressure.tips.json` (or the relevant `{slug}.tips.json`)
2. Add to the appropriate `tipCategories[].tips[]` array:
   ```json
   { "icon": "fas fa-icon-name", "title": "21. New Tip Title", "content": "Tip text with <a href=\"url\">links</a> supported." }
   ```
3. In each non-EN overlay file, add the translated tip at the same array position (only text fields — `title` and `content` — no `icon`):
   ```json
   { "title": "21. Neuer Tipp-Titel", "content": "Tipp-Text..." }
   ```
4. Run `node validate.js && node build.js`

### Add a new FAQ item
**On the FAQ page** (`faq.utility.json`):
1. Open `data/en/faq.utility.json`
2. Add to the appropriate `data.sections[].items[]`:
   ```json
   { "question": "New question?", "answer": "Answer with **bold** and [links](url) supported." }
   ```
   Optional fields: `images` (array of `{src, class}`), `listItems` (string array), `answerAfterList` (markdown)
3. In each non-EN overlay, add the translated item at the same array position (only translated text fields, no structural fields like `images` with paths)
4. Run `node validate.js && node build.js`

**On app pages** (e.g., `blood-pressure.app.json`):
1. Open the page file, e.g., `data/en/blood-pressure.app.json`
2. Add to `data.faq.items[]`:
   ```json
   { "question": "New question?", "answer": "Answer with **bold** and [links](url) supported." }
   ```
3. In each non-EN overlay, add the translated item at the same array position (text fields only)
4. Run `node validate.js && node build.js`

### Add a new review
1. Open the EN page file, e.g., `data/en/blood-pressure.app.json`
2. Add to `data.reviews.items[]`:
   ```json
   { "title": "Review Title", "content": "Review text without quotes", "author": "Username, App Name" }
   ```
3. **Translate the review** into every non-EN overlay file. Add only text fields (`title`, `content`, `author`) at the same array position. Each non-EN language must have a `reviews.disclaimer` field (see below).
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
2. **Create overlay files:** For each `data/en/*.json` file, create a corresponding `data/pt/*.json` containing **only the `data` object with translated text fields**. Do NOT include `template`, `slug`, `path`, `outputPath`, `appId`, or `lang` — these are derived from the EN base file automatically. Do NOT include structural fields like `icon`, `src`, `image`, `ogImage`, `iconSrc`, `appStoreUrl`, `appStoreId`, `customCss`, `santaScript` — these are inherited from EN via deep merge.
   ```json
   {
     "data": {
       "meta": { "title": "Pressão Arterial...", "description": "..." },
       "hero": { "imageAlt": "...", "title": "Pressão Arterial", "subtitle": "..." },
       "features": { "title": "...", "items": [{ "title": "...", "description": "..." }] }
     }
   }
   ```
3. **Translate text fields** — CRITICAL fields that are frequently missed on the **index page**:
   - **`apps.items[].title`** — the app name shown in the apps grid (e.g., "Pressão Arterial Feeltracker"). These MUST be translated, not left in English.
   - **`apps.items[].downloadAlt`** — alt text for download buttons in the apps grid
   - **`apps.items[].slug`** — MUST include language prefix (e.g., `"/pt/blood-pressure"`)
   - **`cta.items[].name`** — the app name shown above download buttons in the CTA section at the bottom of the page (e.g., "Pressão Arterial Feeltracker"). These MUST be translated.
   - **`cta.items[].downloadAlt`** — alt text for download buttons in the CTA section
   - **`indexFooter.links[].href`** — MUST use absolute paths with language prefix (e.g., `"/pt/about/"`, `"/pt/privacy/"`). Never use relative paths like `about.html` — they break on non-root pages.
   - **`indexFooter`** content (links, copyright, tagline, disclaimer)
   - All `meta` fields (title, description, keywords, OG tags)
   - All `structuredData` text content (JSON-LD schema — translatable fields like `name`, `description`, `featureList` are in overlay; structure inherited from EN)
   - **`reviews.items[]`** — all review `title` and `content` fields MUST be translated. Keep `author` names unchanged (real usernames). Add a `reviews.disclaimer` field in the target language stating reviews were translated from English (e.g., `"Les avis ont été traduits de l'anglais. Publiés à l'origine sur l'App Store."`)
   - **`conversionEvent.currency`** — set to the local currency (e.g., `"EUR"` for Portugal)
4. **Image paths are inherited from EN** — no need to include them in overlay files. Utility page `bodyContent` with `<img src="...">` tags should use absolute paths like `/images/add_new.jpg`.
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
7. **Current languages** (32 total): English (en), Deutsch (de), Español (es), Français (fr), Italiano (it), Русский (ru), 日本語 (ja), 한국어 (ko), Português Brasil (pt-br), 简体中文 (zh-Hans), Svenska (sv), Norsk (nb), Dansk (da), Suomi (fi), العربية (ar), Català (ca), Čeština (cs), Ελληνικά (el), Français Canada (fr-ca), עברית (he), Hrvatski (hr), Magyar (hu), Nederlands (nl), Polski (pl), Português Portugal (pt), Română (ro), Slovenčina (sk), ไทย (th), Türkçe (tr), Українська (uk), Tiếng Việt (vi), 繁體中文 (zh-Hant)

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
- `{{field}}` — for raw output: plain text, raw HTML blobs (`structuredDataHtml`, `bodyContent`, `christmasHtml`), or values in attributes

**Fields using markdown:** FAQ answers, tip content, feature descriptions, howItWorks step content, app descriptions, footer copyright. These fields store content like:
```json
"answer": "Your data syncs via iCloud. This means **no email** or personal info needed. See our [privacy policy](https://feeltracker.com/privacy/)."
```

**Fields that stay as raw HTML:** `christmasHtml`, `customCss`, `santaScript`, `doctorEndorsementHtml`, `disclaimerTitle`

**Structured data (JSON-LD):** Pages use `structuredData` (array of JSON objects) instead of `structuredDataHtml` (raw string). At build time, `build.js` serializes `structuredData` into `<script type="application/ld+json">` blocks. Non-EN overlays only need the translatable schema fields (`name`, `description`, `featureList`, `mainEntity` for FAQ) — the schema structure is inherited from EN via deep merge.

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

## Translation Workflow

### The problem with naive translation

31 languages x 16 pages = 496 overlay files. Spawning one agent per language (31 agents) to rewrite entire files is slow, token-heavy, and prone to hanging. Most EN edits change only a few strings — the translation work should be proportional to the change, not the file size.

### Diff-based translation (default workflow)

When EN files are edited, use the diff-based workflow. This is fast and predictable because agents receive only the changed strings, not entire files.

**Step 1: Edit the EN file(s)** as normal.

**Step 2: Generate the change manifest:**
```bash
node diff-translate.js                              # all changed EN files
node diff-translate.js data/en/blood-pressure.app.json  # specific file
```

Output shows exactly what changed:
```json
{
  "files": {
    "blood-pressure.app.json": {
      "changes": [
        { "path": "data.hero.subtitle", "old": "Old text...", "new": "New text..." },
        { "path": "data.features.items.2.description", "old": null, "new": "Brand new field" }
      ]
    }
  },
  "summary": { "filesChanged": 1, "stringsChanged": 2 }
}
```

**Step 3: Fan out translation agents** with the compact manifest. Each agent translates the changed strings and applies them via `apply-translation.js` or direct `Edit` calls.

**Step 4: Validate and build:**
```bash
node validate.js && node build.js
```

### Agent prompt template for diff-based translation

Use this prompt structure for translation agents. It's compact — agents finish fast because they only translate N strings, not the entire file.

```
Translate these changed EN strings into [LANGUAGE] and apply them to the overlay file.

Changed strings (from diff-translate.js):
  1. data.hero.subtitle: "New English text here"
  2. data.features.items.2.description: "Another changed string"

Target file: data/[LANG]/[FILENAME]
Action: Read the overlay file, find each path above, and update the value with the [LANGUAGE] translation. Use the Edit tool for surgical changes. If the path doesn't exist in the overlay yet, add it at the correct nesting level.

Rules:
- Only translate text content — never add structural fields (icon, src, image, appId, etc.)
- Preserve JSON structure and escaping (use language-native quotes where possible)
- For new array items, ensure they're at the same positional index as EN
```

### Parallelization strategy

**Scale reference:**
- **32 languages** (31 non-EN): de, es, fr, it, ru, ja, ko, pt-br, zh-Hans, sv, nb, da, fi, ar, ca, cs, el, fr-ca, he, hr, hu, nl, pl, pt, ro, sk, th, tr, uk, vi, zh-Hant
- **16 pages per language**: 5 app + 5 tips + 5 utility + 1 index

**Small changes (1-10 strings in 1-2 files):** Batch languages into ~6 agents, each handling ~5 languages. Each agent's prompt is tiny (just the changed strings repeated per language). This is fast and avoids spawning 31 agents for trivial work.

Example: subtitle change in one file → 6 agents x 5 languages each:
```
Agent 1: Translate 2 strings into de, es, fr, it, ru (5 Edit calls)
Agent 2: Translate 2 strings into ja, ko, pt-br, zh-Hans, sv (5 Edit calls)
Agent 3: Translate 2 strings into nb, da, fi, ar, ca (5 Edit calls)
Agent 4: Translate 2 strings into cs, el, fr-ca, he, hr (5 Edit calls)
Agent 5: Translate 2 strings into hu, nl, pl, pt, ro (5 Edit calls)
Agent 6: Translate 2 strings into sk, th, tr, uk, vi, zh-Hant (6 Edit calls)
```

**Medium changes (10-50 strings across multiple files):** One agent per language (31 agents). Each agent gets the full diff manifest and handles all affected files for its language.

**Large changes (new page or new language):** One agent per page file (up to 16 agents for a new language).

**New language addition:**
1. Phase 1 (single agent): `languages.json` config entry
2. Phase 2 (16 parallel agents): one per page file, each creating the overlay from the EN source
3. Phase 3 (single agent): sitemap + robots.txt + llms.txt
4. Phase 4: `node validate.js && node build.js`

### What NOT to parallelize

- **`build.js` and `validate.js`** — run sequentially after all file edits complete
- **`languages.json`** — single shared file, one agent only
- **`sitemap.xml`** — single shared file, one agent only
- **Template changes** — one agent only
- **EN source file edits** — edit first, then fan out translations

### Post-translation checklist

After translation agents complete:
1. Validate JSON syntax for affected languages:
   ```bash
   for lang in de es fr it ru ja ko pt-br zh-Hans sv nb da fi ar ca cs el fr-ca he hr hu nl pl pt ro sk th tr uk vi zh-Hant; do
     echo "=== $lang ===";
     for f in data/$lang/*.json; do node -e "try { JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK: $f'); } catch(e) { console.log('ERROR: $f: ' + e.message); }"; done;
   done
   ```
2. Run `node validate.js` to catch structural mismatches
3. Run `node build.js` to regenerate all HTML

## Important Notes

- **Never edit HTML files** — they are regenerated by `node build.js`
- **Always run `node validate.js`** before building after structural changes
- **extract.js is for migration only** — don't run it on built files (it reads originals)
- If you need to re-extract, first restore originals: `git checkout <commit> -- <files>`
- The build does NOT delete old files — remove manually when deleting pages
- Tips and index pages have NO shared footer partial — tips pages have no footer at all, index pages have a custom footer stored in `indexFooter`
- Utility pages (about, privacy, terms, support) use raw HTML `bodyContent` — edit the HTML directly in the `.utility.json` files
- The FAQ page (`faq.utility.json`) uses structured JSON with `template: "faq-page"` — edit individual questions/answers as markdown, not raw HTML
