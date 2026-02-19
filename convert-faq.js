#!/usr/bin/env node
/**
 * One-time migration: Convert FAQ bodyContent HTML → structured JSON.
 *
 * Reads data/{lang}/faq.utility.json for all languages,
 * parses the monolithic bodyContent HTML into structured sections/items,
 * and overwrites each file with template "faq-page".
 *
 * Usage: node convert-faq.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const languages = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'languages.json'), 'utf8'));

/**
 * Convert HTML inline content to markdown:
 *  - <strong>text</strong> → **text**
 *  - <a href="url">text</a> → [text](url)
 *  - strip <p> tags
 *  - preserve paragraph breaks
 */
function htmlToMarkdown(html) {
    if (!html) return '';
    let text = html;

    // Convert <strong> to **
    text = text.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    // Convert <a> to markdown links
    text = text.replace(/<a\s+href\s*=\s*"([^"]*)"[^>]*>(.*?)<\/a>/g, '[$2]($1)');

    // Remove <p> and </p> tags, converting them to paragraph breaks
    // First handle </p><p> (adjacent paragraphs) → double newline
    text = text.replace(/<\/p>\s*<p>/g, '\n\n');
    // Remove remaining <p> and </p>
    text = text.replace(/<\/?p>/g, '');

    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return text;
}

/**
 * Extract <img> tags from HTML, returning {images, remainingHtml}.
 * Normalizes all image paths to absolute /images/... paths.
 */
function extractImages(html) {
    const images = [];
    const remainingHtml = html.replace(/<img\s+src="([^"]*)"(?:\s+class="([^"]*)")?[^>]*>/g, (match, src, cls) => {
        // Normalize path to absolute
        let normalizedSrc = src;
        if (normalizedSrc.startsWith('../images/') || normalizedSrc.startsWith('../../images/')) {
            normalizedSrc = '/images/' + normalizedSrc.split('/images/')[1];
        }
        images.push({ src: normalizedSrc, class: cls || '' });
        return '';
    });
    return { images, remainingHtml };
}

/**
 * Extract <ul>...</ul> blocks from HTML.
 * Returns {listItems, listImage, remainingHtml}.
 * listImage handles the special case of an <img> inside a <ul> (iCloud syncing Q).
 */
function extractList(html) {
    const ulMatch = html.match(/<ul>([\s\S]*?)<\/ul>/);
    if (!ulMatch) return { listItems: null, listImage: null, remainingHtml: html };

    const ulContent = ulMatch[1];
    const listItems = [];
    let listImage = null;

    // Extract <li> items
    const liRegex = /<li>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = liRegex.exec(ulContent)) !== null) {
        listItems.push(htmlToMarkdown(m[1].trim()));
    }

    // Check for <img> inside the <ul> (but outside <li>)
    const imgInUl = ulContent.match(/<img\s+src="([^"]*)"(?:\s+class="([^"]*)")?[^>]*>/);
    if (imgInUl) {
        let src = imgInUl[1];
        if (src.startsWith('../images/') || src.startsWith('../../images/')) {
            src = '/images/' + src.split('/images/')[1];
        }
        listImage = { src, class: imgInUl[2] || '' };
    }

    const remainingHtml = html.replace(/<ul>[\s\S]*?<\/ul>/, '');
    return { listItems, listImage, remainingHtml };
}

/**
 * Parse the bodyContent HTML into structured sections.
 */
function parseBodyContent(bodyContent) {
    // Fix malformed </h3 (missing >) — known issue in EN and RU
    let html = bodyContent.replace(/<\/h3\b(?!>)/g, '</h3>');

    // Extract the <h1> page title
    const h1Match = html.match(/<h1>(.*?)<\/h1>/);
    const pageTitle = h1Match ? h1Match[1].trim() : '';
    html = html.replace(/<h1>.*?<\/h1>/, '');

    // Split by <h2> into sections
    // The content before the first <h2> is the "general" section (no title)
    const h2Parts = html.split(/<h2>(.*?)<\/h2>/);
    // h2Parts[0] = content before first h2
    // h2Parts[1] = first h2 title, h2Parts[2] = content after first h2, etc.

    const sections = [];

    for (let i = 0; i < h2Parts.length; i++) {
        if (i === 0) {
            // Content before first h2 — general section
            const items = parseItems(h2Parts[0]);
            if (items.length > 0) {
                sections.push({ title: null, items });
            }
        } else if (i % 2 === 1) {
            // h2 title
            const sectionTitle = h2Parts[i].trim();
            const sectionContent = h2Parts[i + 1] || '';

            // Check if this is a "Contact Us" style section (no <h3> items)
            if (!sectionContent.includes('<h3>')) {
                // Content-only section (like Contact Us)
                sections.push({
                    title: sectionTitle,
                    content: htmlToMarkdown(sectionContent.trim())
                });
            } else {
                const items = parseItems(sectionContent);
                sections.push({ title: sectionTitle, items });
            }
        }
    }

    return { pageTitle, sections };
}

/**
 * Parse <h3>-delimited items within a section.
 */
function parseItems(html) {
    const items = [];
    // Split on <h3> tags
    const h3Parts = html.split(/<h3>(.*?)<\/h3>/);
    // h3Parts[0] = content before first h3 (usually whitespace, ignore)
    // h3Parts[1] = first question, h3Parts[2] = answer content, etc.

    for (let i = 1; i < h3Parts.length; i += 2) {
        const question = h3Parts[i].trim();
        let answerHtml = (h3Parts[i + 1] || '').trim();

        // Extract list first (before images, since list may contain images)
        const { listItems, listImage, remainingHtml: afterList } = extractList(answerHtml);

        // Extract images from the remaining HTML (after list extraction)
        const { images, remainingHtml: afterImages } = extractImages(afterList);

        // If there's a list, split the remaining HTML into "before list" and "after list"
        let answer, answerAfterList;
        if (listItems && listItems.length > 0) {
            // The original HTML had: <p>answer text</p> <ul>...</ul> <p>after text</p>
            // After list extraction, afterImages still has both parts
            // We need to figure out what comes before and after the <ul> in the original
            const originalBeforeUl = answerHtml.split(/<ul>/)[0];
            const originalAfterUl = answerHtml.split(/<\/ul>/)[1] || '';

            // Extract images from before-list part
            const { images: imgsBefore, remainingHtml: beforeClean } = extractImages(originalBeforeUl);
            // Extract images from after-list part
            const { images: imgsAfter, remainingHtml: afterClean } = extractImages(originalAfterUl);

            answer = htmlToMarkdown(beforeClean.trim());
            answerAfterList = htmlToMarkdown(afterClean.trim()) || null;

            // Combine all images (before + after list)
            const allImages = [...imgsBefore, ...imgsAfter];

            const item = { question, answer };
            if (listItems.length > 0) item.listItems = listItems;
            if (listImage) item.listImage = listImage;
            if (answerAfterList) item.answerAfterList = answerAfterList;
            if (allImages.length > 0) item.images = allImages;
            items.push(item);
        } else {
            answer = htmlToMarkdown(afterImages.trim());
            const item = { question, answer };
            if (images.length > 0) item.images = images;
            items.push(item);
        }
    }

    return items;
}

// Process all languages
let processed = 0;
let errors = 0;

for (const langCode of Object.keys(languages)) {
    const faqPath = path.join(DATA_DIR, langCode, 'faq.utility.json');
    if (!fs.existsSync(faqPath)) {
        console.log(`  Skip: ${langCode} (no faq.utility.json)`);
        continue;
    }

    try {
        const faqData = JSON.parse(fs.readFileSync(faqPath, 'utf8'));
        const { pageTitle, sections } = parseBodyContent(faqData.data.bodyContent);

        // Build new structured JSON
        const newData = {
            template: 'faq-page',
            lang: faqData.lang,
            slug: faqData.slug,
            path: faqData.path,
            outputPath: faqData.outputPath,
            data: {
                meta: faqData.data.meta,
                structuredDataHtml: faqData.data.structuredDataHtml,
                pageTitle,
                sections
            }
        };

        fs.writeFileSync(faqPath, JSON.stringify(newData, null, 2) + '\n');
        console.log(`  ✓ ${langCode}: ${sections.length} sections, pageTitle="${pageTitle}"`);
        processed++;
    } catch (err) {
        console.error(`  ✗ ${langCode}: ${err.message}`);
        errors++;
    }
}

console.log(`\nDone! Processed ${processed} languages.${errors ? ' ' + errors + ' error(s).' : ''}`);
if (errors) process.exit(1);
