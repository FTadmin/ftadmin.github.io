# Design Improvement Plan — Feeltracker Static Site

## Context

The site has good bones — clean blue palette (#2B7BD3), Inter typography, dark-mode support, responsive grids. But it's accumulated cruft:

- **`shared.css` is 2,928 lines in one file**, with the Milo snowball game (~900 lines) mixed in with navigation, cards, and typography.
- **No CSS variables.** Colors, spacing, and shadows are hardcoded across thousands of lines. Dark mode repeats `@media (prefers-color-scheme: dark)` blocks in ~300 lines of duplicated rules.
- **Inline styles are everywhere** — templates (e.g. `index-page.html:77`) and the nav partial (`templates/partials/nav.html:3-170`) carry chunks of CSS inside `style=""` / `<style>` tags.
- **`customCss` fields inside tips JSON** duplicate the same `.tip-card` / `.tips-grid` rules across every tips page. Editing tip-card design means editing data files.
- **Mixed font stack** — Inter for body, Nunito only for the game.
- **Inconsistent scales** — border radii jump 8/12/16/22.37%/25px; shadows flat; spacing ad-hoc (10/12/16/20/28/30…).

Goal: ship a full overhaul — design tokens, de-duplicated CSS, a visual refresh within the existing brand, and a split game stylesheet — without regenerating translations or touching non-EN data.

**User decisions**
- **Scope:** full overhaul (all tiers).
- **Game CSS:** split into `game.css`, load conditionally.
- **Tips JSON:** okay to strip `customCss` from the 5 EN tips files.
- **Brand:** keep `#2B7BD3` as primary; tune secondary/accent/surface/dark-mode values for harmony.

---

## Plan

### Phase 1 — Design tokens (foundation)

Add a `:root` token layer at the top of `shared.css` and a dark-mode override that flips only the token values. Any rule using `var(--…)` adapts automatically.

```css
:root {
  /* Color — primary locked to brand */
  --color-primary: #2B7BD3;
  --color-primary-hover: #1a5ca8;
  --color-primary-tint: rgba(43,123,211,.08);

  /* Refined accents (within brand) */
  --color-accent: #0f9d6b;          /* privacy/success, slightly cooler than #059669 */
  --color-warn: #d97706;

  /* Surfaces & text */
  --color-bg: #ffffff;
  --color-surface: #f9fafb;
  --color-surface-muted: #f3f4f6;
  --color-border: #e5e7eb;
  --color-text: #0f172a;
  --color-text-muted: #475569;
  --color-text-subtle: #94a3b8;

  /* Spacing (4px base) */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:24px; --space-6:32px; --space-7:48px; --space-8:64px; --space-9:96px;

  /* Radius */
  --radius-sm:8px; --radius-md:12px; --radius-lg:16px; --radius-xl:24px; --radius-pill:999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06);
  --shadow-md: 0 4px 12px rgba(15,23,42,.06), 0 2px 4px rgba(15,23,42,.04);
  --shadow-lg: 0 10px 30px rgba(15,23,42,.08), 0 4px 10px rgba(15,23,42,.04);
  --shadow-primary: 0 12px 28px rgba(43,123,211,.14);

  /* Type */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* Motion */
  --ease: cubic-bezier(.2,.7,.2,1);
  --dur-fast: 150ms;
  --dur: 220ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0b1220;
    --color-surface: #111827;
    --color-surface-muted: #1f2937;
    --color-border: #1f2937;
    --color-text: #f1f5f9;
    --color-text-muted: #94a3b8;
    --color-text-subtle: #64748b;
    --color-primary: #60a5fa;
    --color-primary-hover: #93c5fd;
    --color-primary-tint: rgba(96,165,250,.10);
    --color-accent: #34d399;
  }
}
```

Then sweep `shared.css`, replacing hardcoded hex/px with tokens. Collapse redundant `@media (prefers-color-scheme: dark)` blocks wherever the rule already uses tokens. Target: ~200+ lines deleted from dark-mode duplication.

### Phase 2 — Typography & font stack

- In `templates/partials/head-assets.html`: drop Nunito and Nunito Sans Google Font imports; keep Inter (weights 400/500/600/700).
- Standardize h1/h2/h3 sizes, `letter-spacing`, `line-height` via `--font-sans` + explicit scale in `shared.css` (e.g. `--fs-h1: clamp(2.2rem, 4vw, 3rem)`).

### Phase 3 — Consolidate inline CSS

- `templates/partials/nav.html`: delete the inline `<style>` block (lines 3–170); add `/* === NAV === */` section to `shared.css` with tokenized equivalents.
- `templates/index-page.html`: replace inline `style="…"` (privacy badge, founder quote, AI disclaimers) with semantic classes — `.privacy-badge`, `.founder-quote`, `.ai-disclaimer` — defined once in `shared.css`.
- Audit `templates/app-page.html`, `tips-page.html`, `about-page.html`, `support-page.html`, `legal-page.html`, `faq-page.html` for stray inline styles; move each to a class.

### Phase 4 — De-duplicate tips CSS

- Add a `/* === TIPS PAGE === */` section to `shared.css` defining `.tips-grid`, `.tip-card`, `.tip-icon`, hover, and responsive breakpoints (tokenized).
- Delete the `customCss` field from each EN tips JSON:
  - `data/en/blood-pressure.tips.json`
  - `data/en/daily-journal.tips.json`
  - `data/en/mental-health.tips.json`
  - `data/en/sleep.tips.json`
  - `data/en/weight.tips.json`
- Update `templates/tips-page.html` — remove the `{{customCss}}` injection spot if present.
- Update `CLAUDE.md`:
  - Remove `customCss` from the tips-page schema and the "Structural fields" list.
  - Remove the `customCss` mention from "Fields that stay as raw HTML".
- Non-EN overlays don't contain `customCss` (it's a structural field inherited from EN), so no translation work.

### Phase 5 — Visual refresh

**Hero (index-page):**
- Soft radial gradient backdrop: `radial-gradient(ellipse at top, var(--color-primary-tint), transparent 60%)`.
- Hero stats: single row on desktop with `gap: var(--space-7)` and faint divider between groups.
- Privacy badge → pill using `--radius-pill` and a faint green tint background.

**App cards:**
- Corners `--radius-lg`, resting `--shadow-md`, hover `--shadow-primary` + `translateY(-2px)`, transition `var(--dur) var(--ease)`.
- App icon corners → `--radius-lg` (16px) instead of the odd `22.37%`.
- "Learn More" → ghost button (transparent bg, 1px border, primary text) so the App Store badge stays the hero action.

**AI features section:**
- Background: `linear-gradient(180deg, #0f172a, #111827)` plus a faint dotted SVG overlay.
- Cards: `backdrop-filter: blur(8px)` on `rgba(255,255,255,.06)` with a 1px `rgba(255,255,255,.08)` border for a glass effect.

**Reviews grid:**
- `--radius-lg` corners; faint quote-mark SVG watermark in each card's top-right.
- Author line: small caps, `letter-spacing: .08em`, `--color-text-muted`.

**Buttons:**
- Introduce `.btn` + modifiers (`.btn--primary`, `.btn--ghost`, `.btn--sm`) that replace `.learn-more-button`, `.cta-button`, and the game's `.play-game-btn`. Each modifier just swaps tokens.

**Micro-interactions & a11y:**
- Global `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; border-radius: inherit; }`.
- `@media (prefers-reduced-motion: reduce)` — disable snowfall, spin, and transform transitions.

### Phase 6 — Split the game CSS

- Create `game.css` with lines 1–~900 of `shared.css` (Milo snowball game + Santa/snowfall animations). Tokenize colors where cheap.
- Remove those lines from `shared.css`.
- Update `templates/partials/head-assets.html`:
  - Keep `shared.css` as the default.
  - Load `game.css` only when the page needs the game. Simplest route: expose a boolean `hasGame` in the template context (true for index-page and anywhere `santaScript` / `christmasHtml` is non-empty) and wrap `<link rel="stylesheet" href="/game.css">` in `{{#if hasGame}}…{{/if}}`. Default to loading only on `index-page` for now.
  - Alternative: always load `game.css` with `media="(min-width: 0)"` but marked `rel="preload" as="style"` deferred. Simpler and avoids per-page flag; we can pick at implementation time.

### Phase 7 — Extract nav JS

- Create `nav.js` containing the language-selector open/close + outside-click logic currently inline in `templates/partials/nav.html`.
- Replace inline `onclick` handlers with data attributes + delegated listeners (no refactor of semantics).
- Reference `<script defer src="/nav.js"></script>` from `head-assets.html`.

### Phase 8 — Validate & build

1. `node validate.js` — confirm no structural drift (we touch only CSS, templates, and 5 EN tips JSON).
2. `node build.js` — regenerate all 32 × 16 = 512 pages.
3. Manual spot-check:
   - `index.html` (EN): hero, apps, AI, reviews, CTA, footer, nav.
   - `de/index.html`: dark mode flips cleanly via tokens.
   - `blood-pressure/tips/index.html`: tips grid renders correctly without the stripped `customCss`.
   - `zh-Hans/sleep/tips/index.html`: CJK + dark mode + tips grid.
   - `about/index.html`: legal/support/about pages still look correct with token colors.
4. Toggle OS dark mode; resize to 375px and 768px; verify nav, hero, cards, reviews.
5. Lighthouse: confirm no Performance/Accessibility regression; expect a11y up from new `:focus-visible` + reduced-motion support.
6. Grep for remaining inline `style="` in `templates/` — should be near zero after Phase 3.

---

## Files modified

**Rewritten / heavy edits**
- `shared.css` — add tokens, replace hardcoded values, collapse dark-mode duplication, add nav/tips/button/component rules, remove game section.
- `game.css` — **new**, extracted from `shared.css`.
- `nav.js` — **new**, extracted from `nav.html`.

**Templates**
- `templates/partials/head-assets.html` — drop Nunito, conditionally load `game.css`, add `nav.js`.
- `templates/partials/nav.html` — remove inline `<style>` + `onclick` handlers.
- `templates/index-page.html` — replace inline styles with classes.
- `templates/app-page.html`, `tips-page.html`, `about-page.html`, `support-page.html`, `legal-page.html`, `faq-page.html` — audit and convert inline styles to classes (lighter touch).

**Data (EN only — structural, inherited by overlays)**
- `data/en/blood-pressure.tips.json`
- `data/en/daily-journal.tips.json`
- `data/en/mental-health.tips.json`
- `data/en/sleep.tips.json`
- `data/en/weight.tips.json`
  — remove `customCss` field only.

**Docs**
- `CLAUDE.md` — update tips-page schema and structural-fields list to drop `customCss`.

**Optional build-time support**
- `build.js` — if we take the `hasGame` route, wire up the boolean to the template context. Alternative (preload `game.css`) needs no JS change.

---

## Verification checklist

- [ ] `node validate.js` exits 0.
- [ ] `node build.js` completes without errors.
- [ ] `index.html` renders correctly in light + dark OS themes.
- [ ] One translated page (e.g. `de/index.html`) renders correctly, dark-mode tokens apply.
- [ ] Tips page renders without the old `customCss` (CSS now lives in `shared.css`).
- [ ] Nav language selector opens/closes and closes on outside click.
- [ ] No inline `style="` left in templates except raw-HTML data fields.
- [ ] `shared.css` no longer contains Milo game rules; `game.css` loads only where needed.
- [ ] Lighthouse a11y ≥ previous score.

---

## Resume from here (starting state for a fresh agent)

Branch: `claude/improve-design-pXVHJ` (already created and checked out). **Working tree is clean** — no commits, no untracked files, no modifications. Start from a clean slate.

**Earlier-session scratch files (`game.css`, `.shared-nongame.tmp`) were created and then removed** to leave a clean tree. A fresh agent should re-extract the game CSS — see step 1 below.

**Verified facts to avoid re-investigating:**
- `shared.css` is 2,928 lines. The Milo snowball game + Santa + snowfall + Christmas banner occupy **lines 1–1328** (the first block, ending just before `/* Navigation Bar */`). Everything from line 1329 onward is the site design (nav, hero, apps, features, AI, reviews, etc.).
- The game CSS at lines 1–1328 contains **three `font-family: 'Nunito', …` references** (at lines ~21, ~1263, ~1275). Swap all three to `font-family: inherit;` when you extract to `game.css`, so dropping Nunito doesn't break game buttons.

**Already verified:**
- All 5 EN tips files (`data/en/{blood-pressure,daily-journal,mental-health,sleep,weight}.tips.json`) have byte-identical `customCss` values (sha1 `5c79e488b94241d2f082de114cf8c05d2c8f56da`, 1454 chars each). Safe to strip all five and replace with a single unified block in `shared.css`.
- `data/en/index.json` has a 4,291-char `santaScript` JS blob, but `christmasHtml` and `christmasBannerHtml` are commented-out HTML (`<!-- … -->`). The game markup is currently inert — loading `game.css` is future-proofing, not required to render today.
- `templates/tips-page.html` line 97–99 currently wraps `{{customCss}}` in a `<style>` block. Remove lines 97–99 entirely when stripping `customCss`.
- `build.js` already strips structural fields from non-EN overlays; `customCss` is not in the current strip list, but non-EN tips overlays don't contain `customCss` anyway (confirmed by grepping — it only lives in EN). After the strip, no build.js change is needed for this field.

**Suggested execution order for a fresh agent:**
1. Extract game CSS: read lines 1–1328 of `shared.css`, write them to a new `game.css`, and replace all three `font-family: 'Nunito', …` references with `font-family: inherit;`. Useful one-liner:
   ```bash
   node -e "const fs=require('fs'); let c=fs.readFileSync('shared.css','utf8').split('\n').slice(0,1328).join('\n'); c=c.replace(/font-family: 'Nunito',[^;]*;/g,'font-family: inherit;'); fs.writeFileSync('game.css', c);"
   ```
2. Write new `shared.css` from scratch — tokens + dark-mode override + all non-game rules using tokens + new nav section + new tips section + new classes for inline-style extraction + Phase 5 visual polish + `:focus-visible` + reduced-motion. Lines 1329–2928 of the current `shared.css` are the reference for what rules must be preserved.
3. Create `nav.js` with the language selector logic (currently inline at `templates/partials/nav.html:196-203`, plus the two `onclick` attributes at lines 178 and 185).
4. Edit `templates/partials/nav.html`: delete the `<style>` block (lines 3–173) and the inline `<script>` block (lines 196–203); replace `onclick="document.getElementById('langSelector').classList.toggle('open')"` with `data-lang-toggle` (or similar data attribute) and `onclick="document.cookie=…"` with a data attribute that `nav.js` reads.
5. Edit `templates/partials/head-assets.html`:
   - Remove `&family=Nunito:wght@…&family=Nunito+Sans:wght@…` from the Google Fonts URL (keep Inter only).
   - Add `<script defer src="/nav.js"></script>`.
   - Add conditional `{{#if hasGame}}<link rel="stylesheet" href="/game.css">{{/if}}`.
6. Edit `build.js` to derive `hasGame`: set it true when `data.santaScript` is a non-empty string. Inject into the context returned from `buildContext()` (around line 385–401).
7. Edit `templates/index-page.html`: replace inline styles with classes (`.privacy-badge`, `.as-seen-section` block, `.as-seen-label`, `.as-seen-logo-row`, `.as-seen-name`, `.founder-quote` and children, `.app-badge`, `.ai-tier-label`, `.ai-disclaimer` (box), `.cta-downloads`, `.cta-download-item`, `.cta-download-name`, `.reviews-disclaimer`). Define each in `shared.css`.
8. Edit `templates/app-page.html`: replace inline styles with classes (hero badge, privacy pill, press mention pill, AI tier labels, AI disclaimer, reviews disclaimer, tips-teaser dark card, CTA store button width). Reuse classes created for index-page where possible.
9. Edit `templates/tips-page.html`: delete the `<style>{{customCss}}</style>` block (lines 97–99).
10. Edit each of the 5 EN tips JSON files with `apply-translation.js` (or a small Node script) to remove only the `data.customCss` field — preserve all other fields.
11. Edit `CLAUDE.md`: remove `customCss` from the tips-page schema description, from "Fields that stay as raw HTML", and any other reference. Search for `customCss` to find all mentions.
12. Run `node validate.js && node build.js`. Fix any template errors.
13. Spot-check rendered HTML:
    - `index.html` — hero, apps, AI, reviews, CTA, footer.
    - `blood-pressure/tips/index.html` — tips grid still renders.
    - `de/index.html` and `zh-Hans/sleep/tips/index.html` — dark mode + translations intact.
14. Commit on `claude/improve-design-pXVHJ`:
    - `git add -A` (all template, css, js, data changes).
    - Commit message suggestion: `Redesign site: design tokens, unified nav, split game CSS, de-duplicated tips styling`.
15. `git push -u origin claude/improve-design-pXVHJ`.

**Things to avoid redoing:**
- Do NOT edit non-EN tips overlays — `customCss` is not in them (EN-only structural field).
- Do NOT edit `validate.js` — it compares structure against EN, and stripping `customCss` from EN removes the requirement for all languages at once.

**Sanity check before starting:** run `git status` to confirm the branch state. Tree should be clean with no modifications.
