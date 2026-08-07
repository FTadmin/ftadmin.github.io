# Feeltracker Static Site — Build System Guide

## MANDATORY: When asked to translate or propagate changes

**NEVER** read all overlay files. **NEVER** rewrite entire overlay files.

**ALWAYS follow this sequence:**

1. Run `node diff-translate.js` to get the change manifest (only changed strings)
2. Batch all 31 languages into ~6 agents (5 languages each) — each agent gets only the changed strings
3. Each agent uses `apply-translation.js` with a JSON patch (surgical update, not file rewrite)
4. After all agents finish: `node verify-translation.js <file> <paths...> && node validate.js && node build.js`
   (`verify-translation.js` checks the translated strings; `validate.js` only checks shape. For a purely
   textual EN change — a number, a date — add `--expect '<path>=/new value/'` or a stale translation passes.)

**Token limit errors happen when agents read/rewrite whole files** — the patch-based approach avoids this entirely. An agent translating 3 strings for 5 languages makes 5 small `apply-translation.js` calls, touching zero bytes of the existing file content.

---

## Brand wordmark — locked styling

The "feeltracker" wordmark (`.hero-logo` on the homepage hero and `.nav-row-brand .brand-logo` on every page's nav) has a **fixed** visual treatment. Do not change it without explicit instruction from the user.

- **Font:** `Nunito Sans` (the non-rounded sibling of Nunito). Loaded in `templates/partials/head-assets.html` and exposed as the `--font-brand` token in `shared.css`. Do NOT use Nunito (rounded), Inter, Instrument Serif, or any other face for the wordmark.
- **Weight:** `700`. (800 reads heavier than the original Inter 700 — don't bump it.)
- **Color:** `var(--color-primary)` (#2B7BD3 light / #60a5fa dark). Never a gradient, never black, never muted.
- **Case:** lowercase.
- **Letter-spacing:** `-0.02em`.

Both `.hero-logo` and `.nav-row-brand .brand-logo` carry a `/* Brand wordmark — ... See CLAUDE.md. */` comment in `shared.css`. If a redesign pass touches those rules, restore this exact set.

## Large-file edits

Prefer `Edit` with targeted old/new strings over full-file `Write` for any file over ~50KB (e.g. `shared.css`, large JSON overlays, 500+ line templates) — `Write` can time out on big payloads. Break rewrites into several small `Edit` calls, or pipe through a Node one-liner via `Bash` (`node -e "const fs=require('fs'); …; fs.writeFileSync(…)"`). The same rule applies to the plan file during plan mode.

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

**Structural fields** (stripped from overlays, inherited from EN): `icon`, `src`, `image`, `ogImage`, `appId`, `appStoreId`, `appStoreUrl`, `iconSrc`, `santaScript`

```
data/
  site.json                    ← Global config (URLs, GTM/GA IDs, author)
  languages.json               ← Per-language config (nav, footer, cookie, flag)
  en/                          ← English page files — COMPLETE (structure + text)
    blood-pressure.app.json    ← App page: Blood Pressure
    blood-pressure.tips.json   ← Tips page: Blood Pressure
    daily-journal.app.json     ← App page: Daily Journal
    daily-journal.tips.json    ← Tips page: Daily Journal
    mental-health.app.json     ← App page: Mental Health
    mental-health.tips.json    ← Tips page: Mental Health
    sleep.app.json             ← App page: Sleep
    sleep.tips.json            ← Tips page: Sleep
    weight.app.json            ← App page: Weight
    weight.tips.json           ← Tips page: Weight
    about.utility.json         ← Utility page: About (about-page template)
    faq.utility.json           ← Utility page: FAQ (faq-page template)
    privacy.utility.json       ← Utility page: Privacy (legal-page template)
    support.utility.json       ← Utility page: Support (support-page template)
    terms.utility.json         ← Utility page: Terms (legal-page template)
    index.json                 ← Homepage
  de/                          ← German (16 OVERLAY files, translated text only)
  es/  fr/  it/  ru/  ja/  ko/  pt-br/  zh-Hans/  sv/  nb/  da/  fi/
  ar/  ca/  cs/  el/  fr-ca/  he/  hr/  hu/  nl/  pl/  pt/  ro/
  sk/  th/  tr/  uk/  vi/  zh-Hant/   ← 31 non-EN language overlays
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
verify-translation.js ← Checks translated STRINGS (tags, hrefs, not-English, expected values)
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
node verify-translation.js <file> <path>...   # Check the translations themselves (see --help in file)
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

**Reviews are testimony — never edit what a reviewer said.** See the rule in
"Translation tips and common pitfalls" below: translate faithfully, and never
apply a site-wide rename, product-name change or copy edit inside
`reviews.items[].content` or `.title`.

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
2. **Create overlay files:** For each `data/en/*.json` file, create a corresponding `data/pt/*.json` containing **only the `data` object with translated text fields**. Do NOT include `template`, `slug`, `path`, `outputPath`, `appId`, or `lang` — these are derived from the EN base file automatically. Do NOT include structural fields like `icon`, `src`, `image`, `ogImage`, `iconSrc`, `appStoreUrl`, `appStoreId`, `santaScript` — these are inherited from EN via deep merge.
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
   - **`apps.items[].slug`** — do NOT override in overlays. Inherited from EN; the build system prepends the language prefix automatically at render time.
   - **`cta.items[].name`** — the app name shown above download buttons in the CTA section at the bottom of the page (e.g., "Pressão Arterial Feeltracker"). These MUST be translated.
   - **`cta.items[].downloadAlt`** — alt text for download buttons in the CTA section
   - **`indexFooter.links[].href`** — MUST use absolute paths with language prefix (e.g., `"/pt/about/"`, `"/pt/privacy/"`). Never use relative paths like `about.html` — they break on non-root pages.
   - **`indexFooter`** content (links, copyright, tagline, disclaimer)
   - All `meta` fields (title, description, keywords, OG tags)
   - `structuredData` — **translate:** `name`, `description`, `featureList[]` (string array — each item by index), `mainEntity[].name`, `mainEntity[].acceptedAnswer.text`. **Never translate (structural, inherited from EN):** `@context`, `@type`, `offers`, `aggregateRating`, `author`, `screenshot`, `softwareVersion`, `award`, `inLanguage` (array of language codes).
   - **`reviews.items[]`** — all review `title` and `content` fields MUST be translated. Keep `author` names unchanged (real usernames). Add a `reviews.disclaimer` field in the target language stating reviews were translated from English (e.g., `"Les avis ont été traduits de l'anglais. Publiés à l'origine sur l'App Store."`)
   - **`conversionEvent.currency`** — set to the local currency (e.g., `"EUR"` for Portugal)
4. **Image paths are inherited from EN** — no need to include them in overlay files. Any raw HTML fields (e.g. `contentSections[].html`) with `<img src="...">` tags must use absolute paths like `/images/add_new.jpg`.
5. **Update `sitemap.xml`:**
   - Add a new `<url>` entry for every page in the new language (16 total)
   - Add `<xhtml:link rel="alternate" hreflang="pt" href="..."/>` to **every existing** `<url>` entry across all languages
7. **Update `robots.txt`:** Add the new language to the "Available in" comment
8. **Update `llms.txt`:** Add the new language to the Languages section with its URL
9. **Validate and build:** Run `node validate.js && node build.js`

### Translation tips and common pitfalls
These lessons were learned from the Simplified Chinese (zh) translation and apply to all future translations:

1. **JSON escaping** — Translated text often contains quotation marks (e.g., AI says "your data shows..."). ASCII double quotes (`"`) inside JSON string values MUST be escaped as `\"`, or use the language's native quotation marks (e.g., Chinese `\u201C...\u201D`, French `«...»`, German `„..."`) which don't need escaping.
2. **The `howItWorks` steps** are the most error-prone fields — they contain long markdown content with embedded examples using quotes. Always verify these parse as valid JSON after translation.
3. **Raw HTML fields in utility pages** — fields like `contentSections[].html`, `contact.supportText`, `intro`, `sections[].content` contain raw HTML that can be thousands of characters on a single JSON line. Unescaped quotes or backslashes in translated HTML will break JSON parsing. After writing utility page overlay files, always validate with `node -e "JSON.parse(require('fs').readFileSync('data/{lang}/file.json','utf8'))"`.
4. **Quick JSON validation for all files in a language:**
   ```bash
   for f in data/{lang}/*.json; do node -e "try { JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('OK: $f'); } catch(e) { console.log('ERROR: $f: ' + e.message); }"; done
   ```
5. **Sparse array risk with `apply-translation.js`** — When translating an array item at index N, all items 0..N-1 must already exist in the overlay. If they don't, `apply-translation.js` pads missing indices with `null`, which overrides the EN values on merge. Always translate all items in an array together, never selectively by index.
6. **Inserting an array item mid-array silently shifts every later item in all 31 overlays.** The most dangerous edit in this repo, and `validate.js` will NOT stop it: the merge is positional, so adding a section at EN index 12 makes EN[12] merge against `overlay[12]`, which still holds the old translation. Every later section renders under the wrong heading and the last one falls off the end (overlay length wins). `validate.js` reports it as an **array-length warning and exits 0**, so `validate && build` will publish it. Before translating, realign all 31 overlays mechanically with a `splice` script — insert **the EN object** as placeholder (never `null`, which overrides EN with nothing), guard on the expected pre-insert length so a re-run can't double-shift, then spot-check that index `AT+1` still holds what it did before and the last section survived.
7. **Verify a fan-out mechanically — an agent's "OK" is not evidence.** Agents have self-reported success while dropping a `<strong>` pair, and have reported completion before their own sub-agents had written anything. Run `node verify-translation.js` (below) and check `git status`: a "successful" fan-out that modified no overlay file did nothing.
8. **Brand names: match what the vendor ships in that locale, verified against their own localized site.** It varies per locale and cannot be guessed — Apple Intelligence stays English in almost every locale (verified ja, zh-Hant) but is **"Apple 智能"** in Simplified Chinese (verified on `support.apple.com/zh-cn`). The usual failure is drift: a pass updates the body but leaves the section *heading* in English, so one locale says both. Grep the whole locale file for the English form afterwards and confirm the count is zero.

9. **Sitemap update script** — For adding a new language's hreflang to all existing entries, use a Node.js script rather than manual editing. The sitemap has 2500+ lines and every `<url>` entry needs a new `<xhtml:link>` for the new language.
10. **Reviews disclaimer** — Every non-EN language MUST include `"disclaimer"` in the reviews section of app pages AND the index page, stating reviews were translated from English (e.g., Chinese: `"评论翻译自英文原文。最初发布在App Store上。"`).
11. **Never change a reviewer's words.** `reviews.items[].content`, `.title`
    and `.author` are real App Store testimony. They get translated — faithfully,
    preserving meaning, tone and any wording the reviewer chose — and nothing
    else. Do NOT apply a site-wide rename, product-name swap, terminology
    normalization or copy edit inside a review, in EN or in any locale.

    This has happened: during the Mood Journal rename, a locale pass rewrote a
    review that said *"mental health has come to take precedence in recent
    years"* into *"the Mood Journal has come to take precedence"* — attributing
    to a real user a sentence they never wrote. A rename sweep matching the old
    product name will hit reviews that merely discuss the topic, so exclude
    `reviews.*` from every sweep by default and re-read any review a sweep
    flags before touching it.

    `author` is a real username: never translate, localize or "correct" it.
    After any rename or bulk pass, grep every locale's `reviews.items[].content`
    for the new product name and confirm each hit is a genuine translation of
    what the EN review says, not an artifact of the sweep.

12. **Current languages** (32 total): English (en), Deutsch (de), Español (es), Français (fr), Italiano (it), Русский (ru), 日本語 (ja), 한국어 (ko), Português Brasil (pt-br), 简体中文 (zh-Hans), Svenska (sv), Norsk (nb), Dansk (da), Suomi (fi), العربية (ar), Català (ca), Čeština (cs), Ελληνικά (el), Français Canada (fr-ca), עברית (he), Hrvatski (hr), Magyar (hu), Nederlands (nl), Polski (pl), Português Portugal (pt), Română (ro), Slovenčina (sk), ไทย (th), Türkçe (tr), Українська (uk), Tiếng Việt (vi), 繁體中文 (zh-Hant)

### Guide pages (EN-first SEO articles, e.g. /blood-pressure/chart-by-age/)

Guide pages are long-form SEO articles that live under an app page's path.
Files: `data/en/{slug}.guide.json`, `template: "guide-page"`. EN files carry
three extra top-level fields: `"enOnly": true`, `"appSlug"` (which nav app to
highlight), and `"fallbackPath"` (where locales without a translation land,
e.g. the parent app page).

**Per-locale availability is automatic.** A guide exists in a locale **iff the
overlay file exists** (`data/de/chart-by-age.guide.json`). `build.js` derives
everything from that: hreflang tags (only available locales, plus x-default,
only once >1), language-switcher targets (available → the guide, unavailable →
`fallbackPath`), the browser-language redirect map (available locales only),
and the "Guides" section on app pages (each locale lists only its own
available guides, URLs language-prefixed). `validate.js` treats guides as
optional per language but still shape-checks any overlay that exists. There is
no partial-broken state: an untranslated guide simply stays EN-only.

**To translate a guide into a locale:**
1. Create the overlay with `apply-translation.js` (never Edit), translating:
   `meta`, `updatedText`, `breadcrumb` (home/app/current labels), `hero`
   (title + `lead` HTML), `sections[].heading` + `sections[].html`, `appCta`
   (title/text/learnMoreText), `faq` (title + items), `related` (title +
   items incl. `description`), `disclaimerTitle`/`disclaimerText`, `cta`.
2. **Internal links inside `lead`, `sections[].html`, FAQ answers, and
   `related.items[].url` must use language-prefixed paths**
   (`/de/blood-pressure/how-to-measure/`) — and should only point at guides
   that exist in that locale; link the EN path's fallback (the app page)
   otherwise. Structural fields (`iconSrc`, `appStoreUrl`, dates) are
   inherited — don't include them.
3. Translate the `guides` block in that locale's `blood-pressure.app.json`
   overlay (title, subtitle, and **all 10 items positionally** — build.js
   filters out unavailable ones per locale, but positions must align with EN).
4. Run `node update-sitemap-guides.js` — regenerates the guide block in
   `sitemap.xml` (between `<!-- guides:start/end -->` markers) from overlay
   availability, hreflang clusters included. Never hand-edit that block.
5. `node validate.js && node build.js`, and JSON-parse the new overlays.

Adding a **new guide**: create the EN file (copy an existing one's shape),
add it to the EN `blood-pressure.app.json` `guides.items`, run
`node update-sitemap-guides.js`, and add it to `llms.txt`.

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
- `{{field}}` — for raw output: plain text, raw HTML blobs (`christmasHtml`, `doctorEndorsementHtml`), or values in attributes

**Fields using markdown:** FAQ answers, tip content, feature descriptions, howItWorks step content, app descriptions, footer copyright. These fields store content like:
```json
"answer": "Your data syncs via iCloud. This means **no email** or personal info needed. See our [privacy policy](https://feeltracker.com/privacy/)."
```

**Fields that stay as raw HTML:** `christmasHtml`, `santaScript`, `doctorEndorsementHtml`

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

31 languages x 16 pages = 496 overlay files. Rewriting entire files is slow and token-heavy. Most EN edits change only a few strings — the translation work should be proportional to the change, not the file size.

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

**Step 3: Fan out translation agents** with the compact manifest. Each agent translates the changed strings and applies them via `apply-translation.js`. **Do not use Edit to rewrite overlay files.**

`apply-translation.js` patch format (pipe JSON to stdin or pass a file):
```bash
echo '{
  "lang": "de",
  "file": "blood-pressure.app.json",
  "translations": [
    { "path": "data.hero.subtitle", "value": "Übersetzter Text" },
    { "path": "data.features.items.2.description", "value": "..." }
  ]
}' | node apply-translation.js

# Multiple languages in one shot:
node apply-translation.js patches/de.json patches/es.json patches/fr.json
```
Set `"value": null` to delete a path. The script creates the overlay file if it doesn't exist.

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
Action: Translate the strings above into [LANGUAGE], then apply them using apply-translation.js:
  echo '{"lang":"[LANG]","file":"[FILENAME]","translations":[{"path":"data.hero.subtitle","value":"...translated..."},...]}' | node apply-translation.js
Do NOT read the overlay file. Do NOT use Edit. apply-translation.js handles missing paths and creates the file if needed.

Rules:
- Only translate text content — never add structural fields (icon, src, image, appId, etc.)
- Preserve JSON structure and escaping (use language-native quotes where possible)
- For new array items, ensure they're at the same positional index as EN
```

### Agent model selection

**Use `opus` at LOW reasoning effort for translation agents** — `model: "opus"` with `effort: "low"`. Translation is high-volume but low-reasoning: it needs a strong grasp of the target language, not deep deliberation. Opus at low effort gives the better linguistic quality without paying for reasoning the task doesn't use, and is meaningfully faster than opus at default effort.

Do NOT drop translation agents to sonnet. Localized copy is user-facing and ships in 31 languages where nobody on the team can proofread most of them — the model's command of the language is exactly the thing not to economize on. Reserve full-effort opus for structural changes, build system work, and complex debugging.

### Parallelization strategy

**Scale reference:**
- **32 languages** (31 non-EN): de, es, fr, it, ru, ja, ko, pt-br, zh-Hans, sv, nb, da, fi, ar, ca, cs, el, fr-ca, he, hr, hu, nl, pl, pt, ro, sk, th, tr, uk, vi, zh-Hant
- **16 pages per language**: 5 app + 5 tips + 5 utility + 1 index

Each agent's prompt contains only the changed strings (not entire files), so prompt size stays small. Parallelise however makes sense — more agents is faster. Standard language groups for reference:
```
Group 1: de, es, fr, it, ru
Group 2: ja, ko, pt-br, zh-Hans, sv
Group 3: nb, da, fi, ar, ca
Group 4: cs, el, fr-ca, he, hr
Group 5: hu, nl, pl, pt, ro
Group 6: sk, th, tr, uk, vi, zh-Hant
```

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

### App product names — canonical form (owner decision, 2026-08-04)

Refer to each app by its simplest name. These are the canonical English
forms:

| Slug | Name |
|---|---|
| `daily-journal` | Daily Journal |
| `mood-journal` | Mood Journal |
| `blood-pressure` | Blood Pressure Journal |
| `sleep` | Sleep Journal |
| `weight` | Weight Journal |

No suffixes or feature tags — not "Weight & BMI", "Sleep & CPAP",
"Mood & BPD", "Weight & Diet", "Sleep & Dreams". In non-EN locales use the
natural translation of the same simple form (e.g. de "Blutdruck-Tagebuch",
es "Diario de Presión Arterial"), following that locale's existing
conventions for the noun it already uses for journal/diary.

**Current state does not match this yet.** Locale hero titles, alt text,
`languages.json` nav names and many guide overlays still carry older names
in a mix of English and localized forms — the rename predates this
decision and was never propagated. Aligning them is **one mechanical
find-and-replace sweep**, not a translation job, and should be done in a
single pass across `languages.json`, every `<app>.app.json`, `.tips.json`
and `.guide.json`, so all locales move together. Until that sweep runs,
translation agents should keep following each locale's own established
usage so individual locales stay internally coherent — do not switch names
mid-fan-out.

### Crisis-line numbers in guide content (owner decision, 2026-08-04)

Guides that touch mental-health crises MAY name well-known national crisis
lines, **each clearly labeled with its country** (e.g. German pages: "in
Deutschland: Telefonseelsorge 0800 111 0 111") — a labeled number is useful
even though locale pages serve several countries. Rules: only numbers that
are well-established and verified (a wrong crisis number is worse than
none), always labeled with the country, and the generic "emergency services
or a crisis line in your country" sentence stays as the base. Never strip
an existing labeled number on consistency grounds.

### Blood-pressure guideline framing — kept in sync with the app (2026-08-07)

The site states **ACC/AHA 2017** as the default: below 120/80 normal,
120–129 elevated, 130/80+ hypertension, below 90/60 low, above 180/120 with
symptoms an emergency. This is not an editorial preference — it is what the
Blood Pressure app actually ships (`BPT/BPTUtils.swift`, applied to
never-customized installs by `migrateRangeDefaultsToGuidelineV2()` in
2.74.3). **The app repo carries a comment pointing back at this site, so the
dependency runs both ways: if either side's guideline copy changes, the
other needs a matching review.**

Deliberately kept alongside it, do not "harmonize" away:
- The labeled ESC/NICE contrast ("US guidelines define hypertension from
  130/80, European from 140/90") in `chart-by-age` and `normal-range`. A
  European reader whose doctor works to 140/90 needs to know why the app
  says 130.
- The home-vs-clinic correspondence (a home average at/above 135/85 ≈ a
  clinic reading of 140/90) in `how-to-measure`, `log-template` and
  `white-coat-hypertension`. True under either guideline.
- The NICE citation in `blood-pressure.tips` — it is about **measurement
  technique** (2–3 readings a minute apart, averaged), not thresholds.

An FAQ answer once said "normally between 90-140 systolic and 60-90
diastolic", which told a reader that 138/88 was fine while the app
colour-coded it High. If you find any page implying the old 90/120/140/160
defaults, it predates 2.74.3 and is wrong.

### Address register — per locale, matches the shipped apps (2026-08-07)

The apps completed their register transition; the website was normalized to
match on 2026-08-07 (~1,600 strings). **Both properties now use the same
form per locale, so a change on one side needs the other reviewed.**

| Form | Locales |
|---|---|
| Informal | de (du), nl (je), sv/da/nb (du), fi (sinä), es (tú), it (tu), ca (tu), pt-br (você), ro (tu), hu (te), pl (Ty, capitalized), zh-Hans/zh-Hant (你, **never** 您) |
| Polite | fr/fr-ca (vous), ru (вы), uk (ви), tr (siz), el (σας), cs/sk (vykání), ja (です/ます), ko (polite ‑요/‑세요) |

No policy set for: en, ar, he, hr, pt, th, vi — follow each locale's own
existing usage.

Three things that make this **not** a find-and-replace, all learned by
getting them wrong first:

1. **Counting the pronoun undercounts wildly.** In Romance and Hungarian the
   register lives in verb conjugation and imperatives. A pronoun-only census
   reported es as 7 strings when it was 429, and hu as 9 when it was ~266.
2. **Look-alikes are everywhere.** German `Sie` is also "they" (the medical
   disclaimer's "Sie sollten nicht verwendet werden" refers to the *apps*);
   Danish/Norwegian `De` is "those"; Dutch `u` is also "uur" (14 clock cells
   in `mood-chart`); Italian `lei` is "her" (Julia Cameron, in
   `morning-pages`). Read the sentence before replacing.
3. **Some strings address *us*, not the reader.** "Do you show ads or track
   me?" is the reader asking a question. Those take the plural form — sv
   `ni`, nl `jullie`, de `ihr` — not the formal singular, and not the
   informal singular either.

Never change register inside `reviews.*`, quoted third-party speech (a
clinician's or therapist's question in the guides), or the GQ headline on
the index page.

`data/languages.json` holds the footer disclaimer and cookie banner that
render on **every page** and cannot be patched by `apply-translation.js`.
It has been missed twice. Check it by hand after any register work.

### Durability rules for large fan-outs (learned the hard way)

A guide-translation fan-out (10 guides × 31 locales per app) ran through a
session usage limit AND a container recycle in one evening. The limit kills
every running agent at once mid-write; the recycle wipes the working tree
and the scratchpad. Origin is the only durable store. Rules that kept the
loss to a relaunch rather than a replay:

1. **Commit and push gated work after every agent completion — never batch.**
   Anything uncommitted when the environment dies is gone. The cost of a
   commit is nothing; the cost of re-translating a locale is ~200k tokens.
2. **Gate mechanically before staging; agent self-reports are not evidence**
   (see pitfall 7 above). The gate that caught real defects checks: JSON
   parse, exactly one top-level `data` key, no structural leaks (`ogImage`,
   `appStoreUrl`, `iconSrc`, dates), no nulls anywhere (sparse-array
   damage), section/faq/related array lengths equal EN, every internal link
   locale-prefixed, and **per-file HTML tag counts equal EN** — the
   tag-count diff caught a locale that silently dropped three `<strong>`
   pairs after every other check passed.
3. **Overlays are written atomically per guide** (apply-translation.js), so
   a killed agent loses only its unwritten guides. Relaunch with a
   completion prompt — "skip existing files, create missing ones, patch the
   guides block if absent" — never re-run the full locale.
4. **The subagent concurrency cap is 20.** Queue the remaining locales and
   launch one as each completes; launching 31 at once silently fails the
   last 11.
5. **Keep the launch queue, spec files, and recovery recipe in files** and
   re-create them from the conversation if the scratchpad dies. Recovery
   after a recycle: `git fetch origin <branch> && git checkout -B <branch>
   origin/<branch>`, census which overlays exist per locale, relaunch
   completion agents for the gaps.
6. **Commit a checkpoint before any risky boundary** (end of a session
   window, large wave launch). A known-defective-but-parseable file is
   worth committing with the defect noted: a three-tag repair patch is
   cheaper than a lost translation.



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
- All utility pages (about, support, privacy, terms, faq) use **structured JSON templates** — NOT raw `bodyContent`. Edit the structured fields (`contentSections`, `sections`, `contact`, etc.) in the `.utility.json` files.
- The FAQ page (`faq.utility.json`) uses structured JSON with `template: "faq-page"` — edit individual questions/answers as markdown, not raw HTML
- **16 files per language** = 5 app (`blood-pressure`, `daily-journal`, `mental-health`, `sleep`, `weight`) + 5 tips (same slugs) + 5 utility (`about`, `faq`, `privacy`, `support`, `terms`) + 1 `index`
- **Plus guide pages** (`{slug}.guide.json`, EN-first, optional per locale) — see "Guide pages" in Common Tasks
