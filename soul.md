# soul.md — Feeltracker

> The soul of the project: who we are, what we believe, and the spirit every
> page, app screen, and line of copy should carry. Read this before you build
> or write anything here. It is the "why" behind the "how" documented in
> `CLAUDE.md`.

---

## What Feeltracker is

Feeltracker is a suite of **five AI-powered health-tracking apps for iPhone,
iPad, and Mac**, made by **Custom Arts** and shipping continuously on the App
Store **since 2013**. This repository is the marketing site —
`feeltracker.com` — that tells their story in 32 languages.

The five apps:

- **Blood Pressure** — the **#1 blood pressure tracking app in the UK**; the
  flagship. Systolic/diastolic, heart rate, MAP, Camera Scan AI that reads
  values straight off a monitor screen.
- **Mental Health** — daily mood on a simple 5-point scale, AI trigger
  identification, iOS 18+ State of Mind integration.
- **Daily Journaling** — distraction-free journaling with AI sentiment and
  theme analysis.
- **Weight & Food** — weight, body fat, BMI, with Camera Scan AI for scale
  displays.
- **Sleep & Dreams** — sleep duration and quality, CPAP/apnea tracking, dream
  analysis.

Twelve-plus years. 1,000,000+ downloads. 22,000+ ratings at a 4.8★ average.
~55,000 monthly users saving 5,000,000+ records a year. These numbers are
earned, not claimed — they are the result of the principles below, not a
substitute for them.

## Who we serve

Real people managing real health, often quietly and for a long time:

- Someone with **hypertension** taking home readings their doctor asked for.
- Someone tracking **bipolar disorder, BPD, PTSD, anxiety, or ADHD** to see
  patterns and bring them to a therapist (DBT/CBT-friendly).
- Someone on **CPAP** documenting sleep apnea therapy.
- Someone losing weight, or just trying to understand themselves through a
  daily entry.

They are not "users" in the abstract. Many live with a chronic condition and
have trusted us with years of intimate data. That trust is the whole company.

## What we believe (non-negotiables)

These are load-bearing. If a change violates one, it is wrong — stop and
reconsider, no matter how good it looks.

1. **Privacy is the product.** Health data lives on the user's **device and
   their own iCloud account**. We have **no servers storing it**, we **never
   access it, and we never sell it**. "Privacy First — No Ads, No Tracking,
   Your Data Stays Private" is not a tagline to soften; it is a promise to keep.

2. **The user owns their data, completely.** Export to PDF, Excel, JSON
   anytime. Bidirectional Apple Health sync. Weekly automatic backups. We are
   a place data passes *through* on its way to being understood — never a
   place it gets locked in.

3. **We are not a medical device, and we say so.** Every health-data surface
   carries the medical disclaimer. AI shows **correlation, not causation**.
   Insights are "for general information only — not medical advice, diagnosis,
   or treatment. Always consult a qualified healthcare provider." We never
   water this down to sound more impressive. Being trustworthy beats sounding
   clinical.

4. **AI is for everyone, not for upsell.** All AI features are **free for
   everyone**, and the apps **never show ads**. Premium buys *more* AI usage
   (≈10× the limits) and supports the work — it never gates a feature behind a
   paywall or rents out the user's attention.

5. **Apple-native, done right.** iOS / iPadOS / macOS (Apple Silicon). One
   universal purchase across all devices. HealthKit, iCloud, widgets, dark
   mode (incl. true-black OLED), Apple Intelligence, Apple Weather. We meet
   users inside the ecosystem they already trust rather than reinventing it.

6. **Everyone, in their own language.** 32 languages with **full
   localization**, including RTL (Arabic, Hebrew) and five calendar systems
   (Gregorian, Hijri, Hebrew, Chinese, Japanese). Health is universal; we
   don't ship a second-class experience to anyone. EN is the source of truth;
   every other language is a faithful overlay, never an afterthought.

## How AI fits

AI makes a pile of readings *legible* — it does not replace the user's
judgment or their doctor. The good version of an AI feature here:

- turns data into a sentence a person actually understands ("Ask a Question",
  Chat, Voice Summary, Doctor Summary, Pattern Detective);
- saves manual entry without fuss (Camera Scan AI / OCR off device screens);
- is honest about uncertainty and always defers to a clinician for decisions;
- treats sensitive content (mood, journals, symptoms) with care, never
  flippancy — even the lighter features ("Make Me Laugh", "Calm Me Down")
  stay kind.

If an AI feature would tempt a user to skip professional care, or implies
more certainty than the data supports, it is a bad feature.

## Voice & tone

- **Calm, plain, and capable.** "AI-Powered Health Tracking Made Simple."
  Short sentences. Concrete benefits. No hype, no fear-mongering about the
  user's health.
- **Respectful of the subject.** Mental health, chronic illness, and sleep
  disorders are spoken about with dignity — never as growth-hack copy.
- **Confident but not boastful.** We can say "#1 in the UK" and "12 years"
  because they're true; we let facts carry the weight and skip the
  superlatives.
- **Trustworthy over clever.** When privacy or medical caveats are at stake,
  clarity wins over polish every time.

## Design philosophy

- A **clean, single-accent blue** (`#2B7BD3`), Inter for text, generous
  whitespace, responsive grids, first-class light/dark mode. Brand-coherent
  and quietly premium — health software should feel calm and dependable.
- **Tokens over hardcoded values; shared CSS over duplication.** The site is
  moving toward a `:root` design-token layer (see `DESIGN-PLAN.md`) so the
  brand stays consistent and changes stay cheap. The **wordmark is locked**
  (Nunito Sans, weight 700, primary blue, lowercase — see `CLAUDE.md`); don't
  touch it without instruction.
- **Static, fast, dependency-light.** Pages are generated from JSON + HTML
  templates by a zero-dependency `build.js`. Never hand-edit generated HTML;
  edit the data and rebuild. Discipline in the pipeline is part of the craft.

## How the soul shows up in the work

- Adding a health figure to a page? It needs the medical/AI disclaimer.
- Writing a new AI feature description? Lead with what the user understands,
  end deferring to their doctor.
- Translating? Faithful in all 32 languages, disclaimers included — no
  language gets a thinner promise.
- Tempted to add analytics that touch personal health data, an ad slot, or a
  server that stores readings? Don't. That's not us.

## In one line

**Feeltracker helps people understand their own health — privately, in their
language, on their own devices — and trusts them to take it to their doctor.**

---

*Custom Arts · feeltracker.com · support@feeltracker.com · since 2013*
