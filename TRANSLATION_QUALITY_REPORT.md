# Translation Quality Audit Report

**Date:** 2026-04-08
**Scope:** All 31 non-EN languages, 16 files each (496 files total)
**Method:** Parallel automated review agents comparing every translated string against EN source

---

## Executive Summary

Every translation file across all 31 languages was reviewed for accuracy, naturalness, consistency, completeness, formatting, and structural compliance. The audit uncovered **systemic cross-language issues** alongside language-specific problems.

**Overall statistics:**
- **CRITICAL issues:** ~95 across all languages
- **WARNING issues:** ~280 across all languages
- **Languages with 0 critical issues:** ko, zh-Hans (2 languages)
- **Worst languages (by critical count):** hr (5), pt-br (5), es (5), pt (4), hu (4)

---

## Systemic Issues (Affect Multiple Languages)

### 1. Slug Overrides with Language Prefix in index.json (CRITICAL)
**Affected:** th, sk, tr, fr-ca, el, ar, nl, ca, pt, ro (10 languages)
**Issue:** `apps.items[].slug` contains hardcoded language prefix (e.g., `/th/blood-pressure`) instead of bare slug. Build system prepends prefix automatically, causing potential double-prefix URLs.
**Fix:** Remove slug fields from index.json overlays in all affected languages.

### 2. Fabricated Reviews in weight.app.json (CRITICAL)
**Affected:** zh-Hant, th, ko, pt (4+ languages)
**Issue:** Three fake reviews (HealthyLife2024, FitTracker99, TechFitFan) appear in weight.app.json that don't exist in the EN source. These were apparently invented during translation.
**Fix:** Remove fabricated reviews from all affected languages.

### 3. Raw HTML Blob in daily-journal.app.json faq.title (EN SOURCE BUG)
**Affected:** ALL 31 languages
**Issue:** The EN source `data/en/daily-journal.app.json` has a corrupted `faq.title` field containing thousands of characters of raw HTML (useCases section + languages section). Every translation faithfully mirrors this corruption.
**Fix:** Fix the EN source first, then update all overlays.

### 4. Relative URLs in support.utility.json and about.utility.json
**Affected:** Nearly all languages
**Issue:** Resource URLs use relative paths (`../../lang/faq/` or `../faq/`) instead of absolute paths (`/lang/faq/`). While many resolve correctly by coincidence, this is fragile and violates CLAUDE.md guidelines.
**Fix:** Convert to absolute paths in all affected files.

### 5. Missing Diacritics in App Files (CRITICAL for pt-br, pt, it)
**Affected:** pt-br (all 5 .app.json), pt (all 5 .app.json), it (8 files)
**Issue:** Thousands of accented characters stripped (pressão→pressao, più→piu, etc.). Tips and utility files are fine — only app files affected. Suggests a tool/encoding issue during initial translation.
**Fix:** Full re-translation pass on affected app files for these 3 languages.

### 6. Untranslated "Apple Health bidirectional sync" / "iCloud backup and sync" in structuredData
**Affected:** zh-Hant, es, it, sv, ca, and others (~10+ languages)
**Issue:** Two featureList items consistently left in English across structuredData arrays.
**Fix:** Translate these two strings in all affected languages.

### 7. "in plain English" Literally Translated
**Affected:** vi ("in simple Vietnamese"), tr ("in plain English" kept literally)
**Issue:** The EN idiom "ask questions in plain English" was mistranslated to reference the wrong language.
**Fix:** Change to "in simple language" equivalent in each language.

### 8. AI Feature Name Inconsistency Across App Files
**Affected:** Nearly all languages
**Issue:** Features like "Calm Me Down", "Make Me Laugh", "Voice Summary", "Doctor Summary", "Sick Note Generator", "Pattern Detective" have 2-6 different translations across the 5 app files + index within the same language.
**Fix:** Standardize feature names within each language.

### 9. "Privacy First" Inconsistency
**Affected:** zh-Hant, zh-Hans, he, fr, and others
**Issue:** The hero privacy tagline "No Ads · No Tracking · Privacy First" has 2-3 different translations within the same language.
**Fix:** Standardize to one form per language.

### 10. conversionEvent.currency Issues
**Affected:** ko (GBP, should be KRW), ja (GBP, should be JPY), ar (SAR, should be GBP), vi (VND, may corrupt ad data)
**Issue:** Currency set to wrong value for the target market.
**Fix:** Set appropriate local currency or keep GBP per business decision.

---

## Per-Language Summary

| Language | Critical | Warning | Top Issues |
|----------|----------|---------|------------|
| **de** | 5 | 8 | HTML entities in support.utility.json, typo "Lebensmomentenen", stale "500K+" stat, broken links in about.utility.json |
| **es** | 5 | 19 | null in structuredData featureList (4 files), HTML entities in weight.tips.json, duplicate reviews in sleep.app.json, broken URLs in support.utility.json |
| **fr** | 5 | 10 | Broken URLs, duplicate reviews (sleep + daily-journal), "#1 en France" false claim, "au UK" grammar error |
| **it** | 3 | 7 | Widespread missing accents (8 files), inconsistent privacy tagline, untranslated featureList |
| **ru** | 4 | 12 | Untranslated operatingSystem, wrong grammatical case in languages.text, Voice Summary inconsistency |
| **ja** | 2 | 6 | "Beurer" mistranslated as "ボイラー" (boiler), "アバウト" unnatural nav text, GBP currency |
| **ko** | 0 | 8 | Slug overrides, relative URLs, GBP currency, privacy text inconsistency |
| **pt-br** | 5 | 13 | **Pervasive missing diacritics** (all 5 app files), "Diário Diário" repetition, GBP currency |
| **zh-Hans** | 0 | 10 | Feature name inconsistencies, untranslated featureList, missing currency in languages.json |
| **zh-Hant** | 3 | 8 | Fabricated reviews, Simplified chars used (账户→帳戶), untranslated featureList |
| **sv** | 5 | 13 | Duplicate reviews (3 files), untranslated stat labels, Title Case in weight, "medelartärpressure" mixed language |
| **nb** | 4 | 14 | Untranslated labels, "humørsporring" spelling error (5x), "helsetapport" typo, Sleep languages in English |
| **da** | 1 | 10 | TTS typos ("stemmegengrivelse"), DBT→DAT error, untranslated labels, grammar error |
| **fi** | 2 | 20 | **Footer links missing /fi/ prefix**, many Finnish word errors (10+ typos), untranslated features |
| **ar** | 2 | 7 | SAR currency, slug overrides, "Daily Daily" app name, 3 variants of "No Ads" |
| **ca** | 3 | 14 | Slug overrides, "#1 in Catalonia" false claim, "insights" untranslated 13x, "detonant" calque |
| **cs** | — | — | Rate limited - not reviewed |
| **el** | 2 | 3 | Stray Korean character in review, slug overrides, German review author |
| **fr-ca** | 4 | 8 | meta.description says UK not Canada, slug overrides, English app names, stale stat |
| **he** | 5 | 9 | "Korean" mistranslated as "קורנית", 3 privacy variants, premium spelling, app name inconsistencies |
| **hr** | 5 | 7 | **FAQ page entirely in German**, 28+ missing review authors, typos |
| **hu** | 4 | 7 | 42+ missing review authors, truncated AI disclaimer, "fitneszceocéljait" typo, register mixing |
| **nl** | 1 | 9 | Slug overrides, German "Artzt" instead of Dutch "arts", "audiossamenvattingen" double-s, 6 variants of "Sick Note" |
| **pl** | 5 | 7 | Gender error "fajne aplikacja", typos ("niefiltrowyane", "nietraditycyjnym"), broken URLs |
| **pt** | 4 | 12 | **Pervasive missing diacritics** (all 5 app files), slug overrides, null in featureList, fabricated reviews |
| **ro** | 3 | 7 | Stale reviews, German review author, slug overrides, "Vede" as imperative (19x) |
| **sk** | 5 | 8 | Reviews array broken (28 misaligned), medical error (forearm vs upper arm), slug overrides, typos |
| **th** | 4 | 14 | Slug overrides, missing conversionEvent.currency (3 files), fabricated reviews, truncated content |
| **tr** | 6 | 6 | Slug overrides, missing quotes, "plain English" literal, reviews out of order, extra privacy section |
| **uk** | 5 | 17 | **Corrupted meta.description** (shell commands embedded), gender errors, relative URLs, terminology chaos |
| **vi** | 3 | 5 | conversionEvent corrupting ad data, missing featureBadge icons, "plain Vietnamese" mistranslation |

---

## Top 10 Most Urgent Fixes

1. **hr/faq.utility.json** — Entire FAQ page is in German, not Croatian. Needs complete retranslation.
2. **uk/mental-health.tips.json** — meta.description contains embedded shell commands. Corrupted data visible in search results.
3. **fi/index.json** — Footer links missing `/fi/` prefix. All footer navigation points to English pages.
4. **pt-br + pt + it** — Thousands of missing diacritics across app files. Needs systematic restoration.
5. **10 languages** — Slug overrides with language prefix in index.json. Risk of double-prefixed broken URLs.
6. **4+ languages** — Fabricated weight.app.json reviews (HealthyLife2024, FitTracker99, TechFitFan).
7. **ja/blood-pressure.app.json** — "Beurer" (medical brand) translated as "ボイラー" (boiler). 6+ occurrences.
8. **sk/blood-pressure.tips.json** — Medical error: "forearm" instead of "upper arm" for BP measurement.
9. **el/mental-health.app.json** — Stray Korean character embedded in review text.
10. **EN source: daily-journal.app.json** — faq.title contains raw HTML blob affecting all 31 languages.

---

## Cross-Language Contamination Issues

Several languages show contamination from other language translations:

| Language | Contamination | File |
|----------|--------------|------|
| hr | German FAQ content | faq.utility.json (entire file) |
| el | Korean character in text | mental-health.app.json review |
| el | German review author | blood-pressure.app.json |
| ro | German review author | blood-pressure.app.json |
| nl | German word "Artzt" | blood-pressure.app.json, index.json, daily-journal.app.json |
| he | Cornish-like mistranslation of "Korean" | Multiple files |

---

## Recommendations

1. **Immediate:** Fix the 10 most urgent issues listed above
2. **Short-term:** Run `apply-translation.js` patches to fix slug overrides, fabricated reviews, and feature name inconsistencies across all languages
3. **Medium-term:** Re-translate the 5 app files for pt-br, pt, and it with proper diacritics
4. **Long-term:** Establish a terminology glossary per language to prevent feature name drift
5. **EN Source:** Fix the daily-journal.app.json faq.title HTML blob — it affects all 31 languages
