#!/usr/bin/env node
// One-time script to add 18 new languages to sitemap.xml
// Adds hreflang links to existing entries + creates new URL entries for each new language

const fs = require('fs');
const path = require('path');

const sitemapPath = path.join(__dirname, 'sitemap.xml');
let xml = fs.readFileSync(sitemapPath, 'utf8');

const newLangs = ['ar', 'ca', 'cs', 'el', 'fr-ca', 'he', 'hr', 'hu', 'nl', 'pl', 'pt', 'ro', 'sk', 'th', 'tr', 'uk', 'vi', 'zh-Hant'];

const allLangs = ['en', 'de', 'es', 'fr', 'it', 'ru', 'ja', 'ko', 'pt-br', 'zh-Hans', 'sv', 'nb', 'da', 'fi', ...newLangs];

// The 16 page slugs (EN paths)
const pageSlugs = [
  '', // homepage
  'about/',
  'blood-pressure/',
  'blood-pressure/tips/',
  'daily-journal/',
  'daily-journal/tips/',
  'faq/',
  'mental-health/',
  'mental-health/tips/',
  'privacy/',
  'sleep/',
  'sleep/tips/',
  'support/',
  'terms/',
  'weight/',
  'weight/tips/'
];

const base = 'https://feeltracker.com';
const today = '2026-04-02';

// Language display names for comments
const langNames = {
  'ar': 'Arabic', 'ca': 'Catalan', 'cs': 'Czech', 'el': 'Greek',
  'fr-ca': 'French Canadian', 'he': 'Hebrew', 'hr': 'Croatian', 'hu': 'Hungarian',
  'nl': 'Dutch', 'pl': 'Polish', 'pt': 'Portuguese', 'ro': 'Romanian',
  'sk': 'Slovak', 'th': 'Thai', 'tr': 'Turkish', 'uk': 'Ukrainian',
  'vi': 'Vietnamese', 'zh-Hant': 'Traditional Chinese'
};

// Page name for comments
function pageNameForSlug(slug) {
  if (slug === '') return 'Homepage';
  return slug.replace(/\/$/, '').replace(/\//g, ' ');
}

// Priority mapping
function getPriority(slug) {
  if (slug === '') return '0.9'; // non-EN homepages
  if (slug.includes('tips/')) return '0.6';
  if (['about/', 'faq/', 'support/', 'privacy/', 'terms/'].includes(slug)) {
    if (['privacy/', 'terms/'].includes(slug)) return '0.3';
    if (slug === 'support/') return '0.4';
    return '0.5';
  }
  return '0.8'; // app pages
}

function getChangefreq(slug) {
  if (slug === '') return 'weekly';
  if (['privacy/', 'terms/'].includes(slug)) return 'yearly';
  if (slug === 'faq/' || slug === 'support/' || slug === 'about/') return 'monthly';
  return 'monthly';
}

// Step 1: Add new hreflang links to every existing <url> entry
// Find the x-default line and insert new langs before it
const xDefaultPattern = /(\s*<xhtml:link rel="alternate" hreflang="fi" href="[^"]*"\/>)\n(\s*<xhtml:link rel="alternate" hreflang="x-default")/g;

xml = xml.replace(xDefaultPattern, (match, fiLine, xDefaultLine) => {
  // Extract the page path from the fi href to determine what page this is
  const fiHrefMatch = fiLine.match(/href="https:\/\/feeltracker\.com\/fi\/([^"]*)"/);
  const pageSlug = fiHrefMatch ? fiHrefMatch[1] : '';

  // For EN homepage, fi href is https://feeltracker.com/fi/
  // For EN about, fi href is https://feeltracker.com/fi/about/

  const newLinks = newLangs.map(lang => {
    const href = pageSlug ? `${base}/${lang}/${pageSlug}` : `${base}/${lang}/`;
    return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}"/>`;
  }).join('\n');

  return `${fiLine}\n${newLinks}\n${xDefaultLine}`;
});

// Step 2: Add new <url> entries for each new language x each page slug
// Insert before </urlset>

const newEntries = [];

for (const lang of newLangs) {
  for (const slug of pageSlugs) {
    const loc = `${base}/${lang}/${slug}`;
    const comment = `  <!-- ${langNames[lang]} ${pageNameForSlug(slug)} -->`;

    // Build hreflang links for ALL languages
    const hreflangs = allLangs.map(l => {
      const href = l === 'en'
        ? (slug ? `${base}/${slug}` : `${base}/`)
        : `${base}/${l}/${slug}`;
      return `    <xhtml:link rel="alternate" hreflang="${l}" href="${href}"/>`;
    }).join('\n');

    const xDefault = slug ? `${base}/${slug}` : `${base}/`;

    const entry = `${comment}
  <url>
    <loc>${loc}</loc>
${hreflangs}
    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}"/>
    <lastmod>${today}</lastmod>
    <changefreq>${getChangefreq(slug)}</changefreq>
    <priority>${getPriority(slug)}</priority>
  </url>`;

    newEntries.push(entry);
  }
}

xml = xml.replace('</urlset>', newEntries.join('\n\n') + '\n\n</urlset>');

fs.writeFileSync(sitemapPath, xml, 'utf8');

// Count results
const urlCount = (xml.match(/<url>/g) || []).length;
console.log(`Done! Sitemap now has ${urlCount} URL entries (was 226).`);
console.log(`Added ${newLangs.length * pageSlugs.length} new entries.`);
console.log(`Added ${newLangs.length} hreflang links to each of 226 existing entries.`);
