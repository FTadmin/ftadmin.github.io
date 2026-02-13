#!/usr/bin/env node
/**
 * One-time migration tool: reads existing HTML files → generates data.json
 *
 * Run: node extract.js
 * Then: node build.js   (to verify round-trip)
 *
 * After verifying, this script can be deleted — data.json is the source of truth.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE_URL = 'https://feeltracker.com';
const APP_SLUGS = ['blood-pressure', 'daily-journal', 'mental-health', 'sleep', 'weight'];
const UTIL_SLUGS = ['about', 'faq', 'privacy', 'support', 'terms'];
const LANG_CONFIG = {
    en: { code: 'en', name: 'English', flag: '\u{1F1EC}\u{1F1E7}', prefix: '', currency: 'GBP', htmlDir: '' },
    de: { code: 'de', name: 'Deutsch', flag: '\u{1F1E9}\u{1F1EA}', prefix: '/de', currency: 'EUR', htmlDir: 'de/' },
    es: { code: 'es', name: 'Español', flag: '\u{1F1EA}\u{1F1F8}', prefix: '/es', currency: 'EUR', htmlDir: 'es/' }
};

// ============================================================
// Regex Helpers
// ============================================================

/** Match first occurrence, return captured group (default 1) */
function m(html, regex, group = 1) {
    const match = html.match(regex);
    return match ? match[group].trim() : '';
}

/** Match all occurrences */
function mAll(html, regex) {
    const results = [];
    let match;
    const r = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((match = r.exec(html)) !== null) {
        results.push(match);
    }
    return results;
}

/** Extract text between two markers */
function between(html, startMarker, endMarker) {
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) return '';
    const contentStart = startIdx + startMarker.length;
    const endIdx = html.indexOf(endMarker, contentStart);
    if (endIdx === -1) return '';
    return html.slice(contentStart, endIdx);
}

/** Extract a section by class name */
function extractSection(html, className) {
    const regex = new RegExp(`<section class="${className}"[^>]*>([\\s\\S]*?)<\\/section>`);
    const match = html.match(regex);
    return match ? match[1] : '';
}

/** Clean whitespace in extracted text */
function clean(s) {
    return s.replace(/\s+/g, ' ').trim();
}

// ============================================================
// Data Extraction — App Pages
// ============================================================

function extractAppPage(html, lang, slug) {
    const data = {};

    // --- App ID ---
    data.appId = m(html, /apple-itunes-app.*?app-id=(\d+)/);

    // --- Meta tags ---
    data.meta = {
        title: m(html, /<title>([\s\S]*?)<\/title>/),
        description: m(html, /<meta name="description" content="([\s\S]*?)">/),
        keywords: m(html, /<meta name="keywords" content="([\s\S]*?)">/),
        ogTitle: m(html, /<meta property="og:title" content="([\s\S]*?)">/),
        ogDescription: m(html, /<meta property="og:description" content="([\s\S]*?)">/),
        ogImage: m(html, /<meta property="og:image" content="([\s\S]*?)">/),
        twitterDescription: m(html, /<meta property="twitter:description" content="([\s\S]*?)">/)
    };

    // --- Structured Data (JSON-LD) — store as pre-rendered HTML ---
    const jsonLdMatches = mAll(html, /(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g);
    data.structuredDataHtml = jsonLdMatches.map(m => '    ' + m[1]).join('\n');

    // --- Hero Section ---
    const heroHtml = extractSection(html, 'hero center-text') || extractSection(html, 'hero');
    data.hero = {};
    if (heroHtml) {
        data.hero.image = m(heroHtml, /src="(\/images\/[^"]+)"/);
        data.hero.imageAlt = m(heroHtml, /class="hero-logo[^"]*"[^>]*alt="([^"]+)"/i) ||
                             m(heroHtml, /alt="([^"]+)"[^>]*class="hero-logo/i) ||
                             m(heroHtml, /<img[^>]+alt="([^"]+)"/);
        data.hero.title = m(heroHtml, /<h1>([\s\S]*?)<\/h1>/);

        // Badge (gold colored, optional)
        const badgeMatch = heroHtml.match(/color:\s*#f59e0b[\s\S]*?>([\s\S]*?)<\/p>/);
        data.hero.badge = badgeMatch ? clean(badgeMatch[1]) : null;

        // Privacy text
        const privacyMatch = heroHtml.match(/fa-shield-alt"><\/i>\s*([\s\S]*?)<\/div>/);
        data.hero.privacy = privacyMatch ? clean(privacyMatch[1]) : 'No Ads \u00b7 No Tracking \u00b7 Privacy First';

        // Subtitle
        data.hero.subtitle = m(heroHtml, /class="hero-subtitle">([\s\S]*?)<\/p>/);

        // CTA alt
        data.hero.ctaAlt = m(heroHtml, /class="store_button"[\s\S]*?alt="([^"]+)"/);

        // Platform info
        data.hero.platformInfo = m(heroHtml, /class="hero-platform-info">([\s\S]*?)<\/p>/);
    }

    // --- Screenshots ---
    const screenshotHtml = extractSection(html, 'screenshots-section');
    if (screenshotHtml) {
        data.screenshots = {
            title: m(screenshotHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/),
            items: mAll(screenshotHtml, /<img src="([^"]+)" alt="([^"]+)"/g).map(match => ({
                src: match[1],
                alt: match[2]
            }))
        };
    }

    // --- Features ---
    const featuresHtml = extractSection(html, 'features-section');
    if (featuresHtml) {
        data.features = {
            title: m(featuresHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/),
            items: mAll(featuresHtml, /<div class="feature-box">\s*<div class="feature-icon"><i class="([^"]+)"><\/i><\/div>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g).map(match => ({
                icon: match[1],
                title: clean(match[2]),
                description: clean(match[3])
            }))
        };
    }

    // --- How It Works (first platforms-section) ---
    const platformsSections = mAll(html, /<section class="platforms-section">([\s\S]*?)<\/section>/g);
    if (platformsSections.length > 0) {
        const howHtml = platformsSections[0][1];
        const stepMatches = mAll(howHtml, /<div class="app-card">\s*<h3>([\s\S]*?)<\/h3>\s*<div class="app-card-content">([\s\S]*?)<\/div>\s*<\/div>/g);
        data.howItWorks = {
            title: m(howHtml, /<h2[^>]*>([\s\S]*?)<\/h2>/),
            subtitle: m(howHtml, /class="section-subtitle[^"]*">([\s\S]*?)<\/p>/),
            steps: stepMatches.map(match => ({
                title: clean(match[1]),
                content: match[2].trim()
            }))
        };
    }

    // --- AI Features (first ai-section) ---
    const aiSections = mAll(html, /<section class="ai-section center-text">([\s\S]*?)<\/section>/g);
    if (aiSections.length > 0) {
        const aiHtml = aiSections[0][1];
        const h3s = mAll(aiHtml, /<h3[^>]*>([\s\S]*?)<\/h3>/g);
        const grids = mAll(aiHtml, /<div class="ai-features-grid">([\s\S]*?)<\/div>\s*<\/div>/g);

        // Parse AI feature items from a grid block
        function parseAiItems(gridHtml) {
            // More robust: find each ai-feature div
            const items = [];
            const itemRegex = /<div class="ai-feature">\s*<h4><i class="([^"]+)"><\/i>\s*([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(gridHtml)) !== null) {
                items.push({
                    icon: itemMatch[1],
                    title: clean(itemMatch[2]),
                    description: clean(itemMatch[3])
                });
            }
            return items;
        }

        // Extract free and premium titles and items
        // Split AI section by h3 markers
        const freeTitle = h3s.length > 0 ? clean(h3s[0][1].replace(/<[^>]+>/g, '')) : 'Free AI Features';
        const premiumTitle = h3s.length > 1 ? clean(h3s[1][1].replace(/<[^>]+>/g, '')) : 'Premium AI Features';

        // Find the two grid sections
        const allAiItems = mAll(aiHtml, /<div class="ai-feature">\s*<h4><i class="([^"]+)"><\/i>\s*([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/g);

        // Find separator: the second h3 tag position
        const secondH3Pos = h3s.length > 1 ? aiHtml.indexOf(h3s[1][0], aiHtml.indexOf(h3s[0][0]) + 1) : -1;

        const freeItems = [];
        const premiumItems = [];
        for (const item of allAiItems) {
            const itemPos = aiHtml.indexOf(item[0]);
            const parsed = {
                icon: item[1],
                title: clean(item[2]),
                description: clean(item[3])
            };
            if (secondH3Pos === -1 || itemPos < secondH3Pos) {
                freeItems.push(parsed);
            } else {
                premiumItems.push(parsed);
            }
        }

        data.aiFeatures = {
            title: m(aiHtml, /<h2>([\s\S]*?)<\/h2>/),
            subtitle: m(aiHtml, /class="section-subtitle">([\s\S]*?)<\/p>/),
            freeTitle,
            free: freeItems,
            premiumTitle,
            premium: premiumItems
        };
    }

    // --- Benefits (second ai-section) ---
    if (aiSections.length > 1) {
        const benefitsHtml = aiSections[1][1];
        data.benefits = {
            title: m(benefitsHtml, /<h2>([\s\S]*?)<\/h2>/),
            subtitle: m(benefitsHtml, /class="section-subtitle">([\s\S]*?)<\/p>/),
            items: mAll(benefitsHtml, /<div class="ai-feature">\s*<h4><i class="([^"]+)"><\/i>\s*([\s\S]*?)<\/h4>\s*<p>([\s\S]*?)<\/p>\s*<\/div>/g).map(match => ({
                icon: match[1],
                title: clean(match[2]),
                description: clean(match[3])
            }))
        };
    }

    // --- Languages Section (platforms-section center-text) ---
    const langSection = m(html, /<section class="platforms-section center-text">([\s\S]*?)<\/section>/);
    if (langSection) {
        data.languages = {
            title: m(langSection, /<h2>([\s\S]*?)<\/h2>/),
            text: m(langSection, /class="section-subtitle">([\s\S]*?)<\/p>/)
        };
    }

    // --- Use Cases (support-section with "Perfect For" type heading, optional) ---
    // Check for a section that has use case headings but NOT FAQ-style content
    const useCaseMatch = html.match(/<section class="support-section">\s*<h2>([^<]*(?:Perfect|Perfekt|Perfecto)[^<]*)<\/h2>([\s\S]*?)<\/section>/);
    if (useCaseMatch) {
        const useCaseHtml = useCaseMatch[2];
        const items = [];
        const ucRegex = /<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
        let ucMatch;
        while ((ucMatch = ucRegex.exec(useCaseHtml)) !== null) {
            items.push({ title: clean(ucMatch[1]), description: clean(ucMatch[2]) });
        }
        if (items.length > 0) {
            data.useCases = { title: clean(useCaseMatch[1]), items };
        }
    }

    // --- FAQ Section ---
    // Find the support-section that starts with "Frequently Asked Questions" or equivalent
    const faqSectionRegex = /<section class="support-section">\s*<h2>([\s\S]*?(?:FAQ|Frequently|Häufig|Preguntas)[\s\S]*?)<\/h2>([\s\S]*?)<\/section>/i;
    const faqMatch = html.match(faqSectionRegex);
    if (faqMatch) {
        const faqHtml = faqMatch[2];
        const items = [];
        // FAQ items: <h3>question</h3> followed by one or more <p> paragraphs
        const parts = faqHtml.split(/<h3>/);
        for (let i = 1; i < parts.length; i++) {
            const questionEnd = parts[i].indexOf('</h3>');
            const question = clean(parts[i].slice(0, questionEnd));
            let answer = parts[i].slice(questionEnd + 5).trim();
            // Trim trailing whitespace but keep the HTML structure
            answer = answer.replace(/\s+$/, '');
            items.push({ question, answer });
        }
        data.faq = {
            title: clean(faqMatch[1]),
            items
        };
    }

    // --- Reviews ---
    const reviewsSectionMatch = html.match(/<section class="support-section">\s*<h2 class="center-text">([\s\S]*?)<\/h2>\s*<p class="center-text section-subtitle"[^>]*>([\s\S]*?)<\/p>\s*<div class="reviews-grid">([\s\S]*?)<\/div>\s*<\/section>/);
    if (reviewsSectionMatch) {
        const reviewsGridHtml = reviewsSectionMatch[3];
        const items = mAll(reviewsGridHtml, /<div class="review-card">\s*<div class="review-header">\s*<div class="review-title">([\s\S]*?)<\/div>[\s\S]*?<\/div>\s*<p class="review-content">"([\s\S]*?)"<\/p>\s*<p class="review-author">-\s*([\s\S]*?)<\/p>\s*<\/div>/g);
        data.reviews = {
            title: clean(reviewsSectionMatch[1]),
            subtitle: clean(reviewsSectionMatch[2]),
            items: items.map(match => ({
                title: clean(match[1]),
                content: match[2].trim(),
                author: clean(match[3])
            }))
        };
    }

    // --- Tips CTA Section ---
    const tipsMatch = html.match(/<section class="support-section"[^>]*style="background:\s*#111827[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<a[^>]*>([\s\S]*?)<\/a>/);
    if (tipsMatch) {
        data.tips = {
            title: clean(tipsMatch[1].replace(/<[^>]+>/g, '')),
            subtitle: clean(tipsMatch[2]),
            ctaText: clean(tipsMatch[3].replace(/<[^>]+>/g, ''))
        };
    }

    // --- CTA Section ---
    const ctaHtml = extractSection(html, 'cta-section center-text') || extractSection(html, 'cta-section');
    if (ctaHtml) {
        data.cta = {
            title: m(ctaHtml, /<h2>([\s\S]*?)<\/h2>/),
            subtitle: m(ctaHtml, /<p>([\s\S]*?)<\/p>/),
            buttonAlt: m(ctaHtml, /class="store_button"[\s\S]*?alt="([^"]+)"/) || m(ctaHtml, /alt="([^"]+)"/)
        };
    }

    return data;
}

// ============================================================
// Data Extraction — Tips Pages
// ============================================================

function extractTipsPage(html, lang, slug) {
    const data = {};

    data.appId = m(html, /apple-itunes-app.*?app-id=(\d+)/);

    data.meta = {
        title: m(html, /<title>([\s\S]*?)<\/title>/),
        description: m(html, /<meta name="description" content="([\s\S]*?)">/),
        keywords: m(html, /<meta name="keywords" content="([\s\S]*?)">/),
        ogTitle: m(html, /<meta property="og:title" content="([\s\S]*?)">/),
        ogDescription: m(html, /<meta property="og:description" content="([\s\S]*?)">/),
        ogImage: m(html, /<meta property="og:image" content="([\s\S]*?)">/),
        twitterDescription: m(html, /<meta property="twitter:description" content="([\s\S]*?)">/)
    };

    // Structured data — store as pre-rendered HTML string
    const jsonLdMatches = mAll(html, /(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g);
    data.structuredDataHtml = jsonLdMatches.map(m => '    ' + m[1]).join('\n');

    // Main content: everything between nav and footer, as raw HTML
    const bodyContent = between(html, '</nav>', '<!-- Footer -->') ||
                        between(html, '</nav>', '<footer>');
    data.bodyContent = bodyContent.trim();

    return data;
}

// ============================================================
// Data Extraction — Utility Pages
// ============================================================

function extractUtilityPage(html, lang, slug) {
    const data = {};

    data.meta = {
        title: m(html, /<title>([\s\S]*?)<\/title>/),
        description: m(html, /<meta name="description" content="([\s\S]*?)">/),
        keywords: m(html, /<meta name="keywords" content="([\s\S]*?)">/) || '',
        ogTitle: m(html, /<meta property="og:title" content="([\s\S]*?)">/),
        ogDescription: m(html, /<meta property="og:description" content="([\s\S]*?)">/),
        ogImage: m(html, /<meta property="og:image" content="([\s\S]*?)">/) || SITE_URL + '/images/feeltracker.png',
        twitterDescription: m(html, /<meta property="twitter:description" content="([\s\S]*?)">/)
    };

    // Structured data — store as pre-rendered HTML string
    const jsonLdMatches = mAll(html, /(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g);
    data.structuredDataHtml = jsonLdMatches.map(m => '    ' + m[1]).join('\n');

    // Body content between nav and footer
    const bodyContent = between(html, '</nav>', '<!-- Footer -->') ||
                        between(html, '</nav>', '<footer>');
    data.bodyContent = bodyContent.trim();

    return data;
}

// ============================================================
// Data Extraction — Index/Homepage
// ============================================================

function extractIndexPage(html, lang) {
    const data = {};

    data.meta = {
        title: m(html, /<title>([\s\S]*?)<\/title>/),
        description: m(html, /<meta name="description" content="([\s\S]*?)">/),
        keywords: m(html, /<meta name="keywords" content="([\s\S]*?)">/) || '',
        ogTitle: m(html, /<meta property="og:title" content="([\s\S]*?)">/),
        ogDescription: m(html, /<meta property="og:description" content="([\s\S]*?)">/),
        ogImage: m(html, /<meta property="og:image" content="([\s\S]*?)">/) || SITE_URL + '/images/feeltracker.png',
        twitterDescription: m(html, /<meta property="twitter:description" content="([\s\S]*?)">/)
    };

    // Structured data — store as pre-rendered HTML string
    const jsonLdMatches = mAll(html, /(<script type="application\/ld\+json">[\s\S]*?<\/script>)/g);
    data.structuredDataHtml = jsonLdMatches.map(m => '    ' + m[1]).join('\n');

    const bodyContent = between(html, '</nav>', '<!-- Footer -->') ||
                        between(html, '</nav>', '<footer>');
    data.bodyContent = bodyContent.trim();

    return data;
}

// ============================================================
// Language-level shared data extraction
// ============================================================

function extractLanguageData(html, langCode) {
    const langConf = LANG_CONFIG[langCode];

    // Extract nav app names from the HTML
    const navApps = [];
    const navAppsHtml = m(html, /class="nav-row-apps">([\s\S]*?)<\/div>/);
    if (navAppsHtml) {
        const appLinks = mAll(navAppsHtml, /href="[^"]*\/([^/"]+)\/"[^>]*>([\s\S]*?)<\/a>/g);
        for (const link of appLinks) {
            const appSlug = link[1];
            const appName = clean(link[2]);
            if (APP_SLUGS.includes(appSlug)) {
                navApps.push({ slug: appSlug, name: appName });
            }
        }
    }

    // Extract footer text
    const footerHtml = between(html, '<footer>', '</footer>');
    const footerLinks = mAll(footerHtml, /<a[^>]*>([\s\S]*?)<\/a>/g).map(m => clean(m[1]));

    // Extract cookie consent text
    const cookieHtml = between(html, 'id="cookieConsent"', '</div>\n    </div>') ||
                       between(html, 'id="cookieConsent"', '</div>\n</div>');

    return {
        code: langConf.code,
        name: langConf.name,
        flag: langConf.flag,
        prefix: langConf.prefix,
        currency: langConf.currency,
        nav: {
            apps: navApps.length > 0 ? navApps : APP_SLUGS.map(s => ({ slug: s, name: s }))
        },
        footer: {
            home: footerLinks[0] || 'Home',
            about: footerLinks[1] || 'About',
            emailSupport: footerLinks[2] || 'Email Support',
            support: footerLinks[3] || 'Support',
            faq: footerLinks[4] || 'FAQ',
            followOnX: footerLinks[5] || 'Follow on X',
            privacyPolicy: footerLinks[6] || 'Privacy Policy',
            termsAndConditions: footerLinks[7] || 'Terms and Conditions',
            copyright: m(footerHtml, /class="footer-copyright">([\s\S]*?)<\/p>/) || '\u00a9 2026 Custom Arts. All rights reserved.',
            tagline: m(footerHtml, /class="footer-tagline">([\s\S]*?)<\/p>/) || 'Part of the Feeltracker family of health tracking apps',
            disclaimer: m(footerHtml, /class="footer-disclaimer">([\s\S]*?)<\/p>/) || ''
        },
        cookie: {
            title: 'We value your privacy',
            text: 'We use cookies for analytics to improve our website and app. No advertising cookies are used. See our',
            linkText: 'Privacy Policy',
            forDetails: 'for details.',
            reject: 'Reject',
            accept: 'Accept'
        }
    };
}

// ============================================================
// Main Extraction
// ============================================================

function extract() {
    console.log('Extracting data from existing HTML files...\n');

    const output = {
        site: {
            url: SITE_URL,
            name: 'Feeltracker',
            author: 'Custom Arts',
            copyrightYear: '2026',
            gtmId: 'GTM-WV9HJBSD',
            gaId: 'G-L718GV41LN',
            awId: 'AW-1066893004'
        },
        languages: {},
        pages: []
    };

    // --- Extract language data from a representative page per language ---
    for (const [langCode, langConf] of Object.entries(LANG_CONFIG)) {
        // Use blood-pressure as the representative page (it exists in all languages)
        const repFile = path.join(ROOT, langConf.htmlDir, 'blood-pressure', 'index.html');
        if (fs.existsSync(repFile)) {
            const repHtml = fs.readFileSync(repFile, 'utf8');
            output.languages[langCode] = extractLanguageData(repHtml, langCode);
            console.log(`  Language "${langCode}" extracted from ${repFile}`);
        } else {
            console.warn(`  WARNING: Representative file not found for ${langCode}: ${repFile}`);
            output.languages[langCode] = LANG_CONFIG[langCode];
        }
    }

    // Fix cookie consent translations for DE and ES
    if (output.languages.de) {
        output.languages.de.cookie = {
            title: 'Wir sch\u00e4tzen Ihre Privatsph\u00e4re',
            text: 'Wir verwenden Cookies f\u00fcr Analysen, um unsere Website und App zu verbessern. Es werden keine Werbe-Cookies verwendet. Siehe unsere',
            linkText: 'Datenschutzerkl\u00e4rung',
            forDetails: 'f\u00fcr Details.',
            reject: 'Ablehnen',
            accept: 'Akzeptieren'
        };
    }
    if (output.languages.es) {
        output.languages.es.cookie = {
            title: 'Valoramos su privacidad',
            text: 'Usamos cookies de an\u00e1lisis para mejorar nuestro sitio web y aplicaci\u00f3n. No se usan cookies publicitarias. Consulte nuestra',
            linkText: 'Pol\u00edtica de Privacidad',
            forDetails: 'para m\u00e1s detalles.',
            reject: 'Rechazar',
            accept: 'Aceptar'
        };
    }

    // --- Extract App Pages ---
    for (const [langCode, langConf] of Object.entries(LANG_CONFIG)) {
        for (const slug of APP_SLUGS) {
            const filePath = path.join(ROOT, langConf.htmlDir, slug, 'index.html');
            if (!fs.existsSync(filePath)) {
                console.warn(`  SKIP: ${filePath} (not found)`);
                continue;
            }
            const html = fs.readFileSync(filePath, 'utf8');
            const data = extractAppPage(html, langCode, slug);

            output.pages.push({
                template: 'app-page',
                lang: langCode,
                slug: slug,
                path: slug,
                outputPath: (langConf.htmlDir ? langConf.htmlDir : '') + slug + '/index.html',
                appId: data.appId,
                data: data
            });
            console.log(`  App page: ${langCode}/${slug}`);
        }
    }

    // --- Extract Tips Pages ---
    for (const [langCode, langConf] of Object.entries(LANG_CONFIG)) {
        for (const slug of APP_SLUGS) {
            const filePath = path.join(ROOT, langConf.htmlDir, slug, 'tips', 'index.html');
            if (!fs.existsSync(filePath)) {
                console.warn(`  SKIP: ${filePath} (not found)`);
                continue;
            }
            const html = fs.readFileSync(filePath, 'utf8');
            const data = extractTipsPage(html, langCode, slug);

            output.pages.push({
                template: 'tips-page',
                lang: langCode,
                slug: slug,
                path: slug + '/tips',
                outputPath: (langConf.htmlDir ? langConf.htmlDir : '') + slug + '/tips/index.html',
                appId: data.appId,
                data: data
            });
            console.log(`  Tips page: ${langCode}/${slug}/tips`);
        }
    }

    // --- Extract Utility Pages ---
    for (const [langCode, langConf] of Object.entries(LANG_CONFIG)) {
        for (const slug of UTIL_SLUGS) {
            const filePath = path.join(ROOT, langConf.htmlDir, slug, 'index.html');
            if (!fs.existsSync(filePath)) {
                console.warn(`  SKIP: ${filePath} (not found)`);
                continue;
            }
            const html = fs.readFileSync(filePath, 'utf8');
            const data = extractUtilityPage(html, langCode, slug);

            output.pages.push({
                template: 'utility-page',
                lang: langCode,
                slug: slug,
                path: slug,
                outputPath: (langConf.htmlDir ? langConf.htmlDir : '') + slug + '/index.html',
                data: data
            });
            console.log(`  Utility page: ${langCode}/${slug}`);
        }
    }

    // --- Extract Index/Home Pages ---
    for (const [langCode, langConf] of Object.entries(LANG_CONFIG)) {
        const filePath = path.join(ROOT, langConf.htmlDir, 'index.html');
        if (!fs.existsSync(filePath)) {
            console.warn(`  SKIP: ${filePath} (not found)`);
            continue;
        }
        const html = fs.readFileSync(filePath, 'utf8');
        const data = extractIndexPage(html, langCode);

        output.pages.push({
            template: 'index-page',
            lang: langCode,
            slug: '',
            path: '',
            outputPath: (langConf.htmlDir ? langConf.htmlDir : '') + 'index.html',
            data: data
        });
        console.log(`  Index page: ${langCode}`);
    }

    // --- Write output ---
    const outputPath = path.join(ROOT, 'data.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nDone! Wrote ${output.pages.length} page entries to data.json`);
    console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

extract();
