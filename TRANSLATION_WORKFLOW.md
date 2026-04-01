# Efficient Translation Workflow

If full-page translations are slow and token-heavy, switch to a **deduplicated string workflow**.

## What changed

- Added `prepare-translation-jobs.js` to extract **unique translatable English strings** with stable IDs.
- It writes:
  - `translation-jobs/en-strings.json` (master string list + references)
  - `translation-jobs/by-file/*.json` (which IDs each page file uses)

## Why this is more efficient

1. **Translate each unique string once** (not once per file occurrence).
2. **Batch by size** (for example 50–150 strings per API call) to keep request/response compact.
3. **Use ID-based caching**: once a target-language translation exists for `t_xxx`, reuse it forever unless source changes.
4. **Parallelize by language and batch** with predictable token budgets.

## Recommended pipeline

1. Regenerate source strings:
   - `node prepare-translation-jobs.js`
2. For each target language, keep a dictionary file:
   - `translation-jobs/<lang>.json` with `{ "t_hash": "translated text" }`
3. Only send untranslated IDs to the model.
4. Apply the dictionary back into `data/<lang>/*.json` with an ID-to-path replacement script (can be added next).
5. Run validation:
   - `node validate.js`
   - `node build.js`

## Extra token savings tips

- Provide a short glossary (brand names, medical terms) once per batch.
- Use strict output format (`JSON object only`) to reduce verbosity.
- Skip non-translatable fields (`customCss`, paths, URLs, image refs, JSON-LD, etc.).

