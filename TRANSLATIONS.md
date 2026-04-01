# Translation system overview

This repository uses a **data-first static-site build**:

1. Source content lives in JSON files under `data/{lang}/`.
2. Shared site/language metadata lives in `data/site.json` and `data/languages.json`.
3. `node build.js` merges those JSON files with HTML templates in `templates/` and writes static pages.

## Important rule (what to edit)

- ✅ Edit **only** JSON source files in `data/`.
- ❌ Do **not** edit generated HTML files in language folders like `de/`, `es/`, `fr/`, `zh/`, etc.
- After JSON changes, run `node build.js` to regenerate webpages.

## Where translation text lives

There are two layers of JSON:

- **Language-global JSON** (`data/languages.json`)
  - Per-language name, URL prefix, nav labels, footer labels, and cookie-consent strings.
  - Example: `en.prefix` is empty while non-English languages use `"/es"`, `"/de"`, etc.

- **Per-page JSON** (`data/{lang}/*.json`)
  - One file per output page.
  - Includes routing metadata (`template`, `lang`, `path`, `outputPath`) plus page content in `data`.
  - Example file names:
    - `index.json`
    - `{slug}.app.json`
    - `{slug}.tips.json`
    - `{slug}.utility.json`

## How JSON fits into rendering

`build.js` does this for each page JSON file:

1. Load `site` and `languages` JSON.
2. Load a page object from `data/{lang}/...json`.
3. Build a render context (language switcher URLs, canonical URL, footer/nav labels, etc.).
4. Render the selected template (`page.template`) with that context.
5. Write output HTML to `page.outputPath`.

So the JSON files are the source of truth; templates are mostly layout.

## Translation workflow in practice

A safe, repeatable flow:

1. **Author/modify English** in `data/en/*.json`.
2. **Translate corresponding files** into other `data/{lang}/*.json` files, keeping keys/shape aligned.
3. Run `node validate.js` to check non-English files match English structure.
4. Run `node build.js` to regenerate static HTML pages.

Optional helper: `prepare-translation-jobs.js` deduplicates repeated English strings and outputs compact translation jobs in `translation-jobs/`.
