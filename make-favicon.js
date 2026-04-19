#!/usr/bin/env node
/**
 * One-shot: take images/FT_1024.png, resize to 256x256, apply circular
 * mask (with antialiased edge), write as images/feeltracker-icon.png.
 *
 * Pure Node built-ins. Run once: `node make-favicon.js`
 */

const fs = require('fs');
const zlib = require('zlib');

// ---------- CRC32 table ----------
const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// ---------- PNG decode ----------
function parsePNG(buf) {
    const sig = '89504e470d0a1a0a';
    if (buf.slice(0, 8).toString('hex') !== sig) throw new Error('not a PNG');

    const idatParts = [];
    let ihdr;
    let pos = 8;
    while (pos < buf.length) {
        const length = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const data = buf.slice(pos + 8, pos + 8 + length);
        if (type === 'IHDR') ihdr = data;
        if (type === 'IDAT') idatParts.push(data);
        pos += 12 + length;
        if (type === 'IEND') break;
    }

    const width = ihdr.readUInt32BE(0);
    const height = ihdr.readUInt32BE(4);
    const bitDepth = ihdr.readUInt8(8);
    const colorType = ihdr.readUInt8(9);
    if (colorType !== 6) throw new Error('only RGBA input supported (colorType=6)');

    const raw = zlib.inflateSync(Buffer.concat(idatParts));
    const bpp = 4 * (bitDepth / 8);   // bytes per pixel in decoded stream
    const scanlineLen = width * bpp;
    const out = Buffer.alloc(height * scanlineLen);

    for (let y = 0; y < height; y++) {
        const filter = raw[y * (scanlineLen + 1)];
        const rowStart = y * (scanlineLen + 1) + 1;
        const outStart = y * scanlineLen;
        for (let i = 0; i < scanlineLen; i++) {
            const rawByte = raw[rowStart + i];
            const left  = i >= bpp ? out[outStart + i - bpp] : 0;
            const up    = y > 0 ? out[outStart - scanlineLen + i] : 0;
            const upLt  = (y > 0 && i >= bpp) ? out[outStart - scanlineLen + i - bpp] : 0;
            let v;
            if (filter === 0) v = rawByte;
            else if (filter === 1) v = (rawByte + left) & 0xff;
            else if (filter === 2) v = (rawByte + up) & 0xff;
            else if (filter === 3) v = (rawByte + ((left + up) >> 1)) & 0xff;
            else if (filter === 4) {
                const p = left + up - upLt;
                const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLt);
                const paeth = (pa <= pb && pa <= pc) ? left : (pb <= pc) ? up : upLt;
                v = (rawByte + paeth) & 0xff;
            } else throw new Error('unknown filter: ' + filter);
            out[outStart + i] = v;
        }
    }

    // Convert 16-bit → 8-bit (just take high byte — standard PNG downsample)
    let px = out;
    if (bitDepth === 16) {
        px = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height * 4; i++) px[i] = out[i * 2];
    }
    return { width, height, channels: 4, pixels: px };
}

// ---------- bilinear resize ----------
function resize(img, target) {
    const { width, height, channels, pixels } = img;
    const out = Buffer.alloc(target * target * channels);
    const xs = width / target, ys = height / target;
    for (let y = 0; y < target; y++) {
        for (let x = 0; x < target; x++) {
            const sx = x * xs, sy = y * ys;
            const x0 = Math.floor(sx), y0 = Math.floor(sy);
            const x1 = Math.min(x0 + 1, width - 1);
            const y1 = Math.min(y0 + 1, height - 1);
            const dx = sx - x0, dy = sy - y0;
            for (let c = 0; c < channels; c++) {
                const p00 = pixels[(y0 * width + x0) * channels + c];
                const p10 = pixels[(y0 * width + x1) * channels + c];
                const p01 = pixels[(y1 * width + x0) * channels + c];
                const p11 = pixels[(y1 * width + x1) * channels + c];
                const v = p00 * (1-dx) * (1-dy) + p10 * dx * (1-dy)
                        + p01 * (1-dx) * dy      + p11 * dx * dy;
                out[(y * target + x) * channels + c] = Math.round(v);
            }
        }
    }
    return { width: target, height: target, channels, pixels: out };
}

// ---------- circular mask with antialiased edge ----------
function circularMask(img) {
    const { width, height, channels, pixels } = img;
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    const r = width / 2;
    const out = Buffer.from(pixels);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const d = Math.hypot(x - cx, y - cy);
            const alphaIdx = (y * width + x) * channels + 3;
            if (d > r) {
                out[alphaIdx] = 0;
            } else if (d > r - 1.5) {
                const fade = Math.max(0, (r - d) / 1.5);
                out[alphaIdx] = Math.round(out[alphaIdx] * fade);
            }
        }
    }
    return { width, height, channels, pixels: out };
}

// ---------- PNG encode (filter type 0 = None) ----------
function encodePNG(img) {
    const { width, height, channels, pixels } = img;
    const colorType = channels === 4 ? 6 : 2;

    const filtered = Buffer.alloc(height * (width * channels + 1));
    for (let y = 0; y < height; y++) {
        filtered[y * (width * channels + 1)] = 0;
        pixels.copy(filtered, y * (width * channels + 1) + 1,
                    y * width * channels, (y + 1) * width * channels);
    }
    const idatData = zlib.deflateSync(filtered, { level: 9 });

    function chunk(type, data) {
        const typeBuf = Buffer.from(type, 'ascii');
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
        const crcBuf = Buffer.alloc(4);
        crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
        return Buffer.concat([len, typeBuf, data, crcBuf]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(colorType, 9);
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);

    const sig = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- run ----------
const SRC = 'images/FT_1024.png';
const DST = 'images/feeltracker-icon.png';
const TARGET = 256;

const src = parsePNG(fs.readFileSync(SRC));
console.log(`Read ${SRC}: ${src.width}x${src.height}`);
const resized = resize(src, TARGET);
console.log(`Resized to ${TARGET}x${TARGET}`);
const masked = circularMask(resized);
console.log('Applied circular mask');
const out = encodePNG(masked);
fs.writeFileSync(DST, out);
console.log(`Wrote ${DST} (${out.length} bytes)`);
