// Hero app-icon physics playground
// Click + drag any icon in the .hero-app-cluster to fling it into the others.
// Lightweight 2D circle collider. No dependencies.
(function () {
    var cluster = document.querySelector('.hero-app-cluster');
    if (!cluster) return;
    var imgs = Array.prototype.slice.call(cluster.querySelectorAll('img'));
    if (imgs.length < 2) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function start() {
        init();
        if (!reduced) requestAnimationFrame(tick);
    }

    // Wait for window load so image dimensions are settled in all browsers
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    // --- state ---
    var bodies = [];
    var bounds = { w: 0, h: 0 };
    var dragging = null;
    var pointerId = null;
    var lastVibrate = 0;
    // Per-image base rotations kept from the CSS treatment
    var baseRot = [-6, 2, 7, 4, -5];

    function init() {
        // Capture each icon's current layout position inside the cluster
        var cRect = cluster.getBoundingClientRect();
        bounds.w = cluster.clientWidth;
        bounds.h = cluster.clientHeight || cRect.height;
        // Ensure the container holds its shape once we absolutely-position children
        cluster.style.position = 'relative';
        cluster.style.minHeight = bounds.h + 'px';

        bodies = imgs.map(function (img, i) {
            var r = img.getBoundingClientRect();
            var w = r.width, h = r.height;
            var cx = r.left - cRect.left + w / 2;
            var cy = r.top - cRect.top + h / 2;
            // After measuring, re-parent to absolute so physics owns position
            img.style.position = 'absolute';
            img.style.left = '0';
            img.style.top = '0';
            img.style.margin = '0';
            img.style.width = w + 'px';
            img.style.height = h + 'px';
            img.style.cursor = 'grab';
            img.style.touchAction = 'none';
            img.style.userSelect = 'none';
            img.style.webkitUserSelect = 'none';
            img.style.webkitUserDrag = 'none';
            img.setAttribute('draggable', 'false');
            img.style.willChange = 'transform';
            // Gentle random drift so it feels alive
            var drift = reduced ? 0 : 0.18;
            return {
                el: img,
                x: cx, y: cy,
                w: w, h: h,
                r: Math.min(w, h) / 2 * 0.94, // collision radius
                vx: (Math.random() - 0.5) * drift,
                vy: (Math.random() - 0.5) * drift,
                rot: baseRot[i] || 0,
                vRot: (Math.random() - 0.5) * 0.1,
                baseRot: baseRot[i] || 0,
                dragX: 0, dragY: 0,
                grab: null  // { ox, oy, lastX, lastY, lastT }
            };
        });

        // Initial render and event wiring
        bodies.forEach(render);
        imgs.forEach(function (img, i) {
            img.addEventListener('pointerdown', onDown.bind(null, bodies[i]));
        });
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('resize', onResize);
    }

    function onResize() {
        var prevW = bounds.w, prevH = bounds.h;
        bounds.w = cluster.clientWidth;
        bounds.h = cluster.clientHeight || bounds.h;
        if (prevW && prevH) {
            var sx = bounds.w / prevW, sy = bounds.h / prevH;
            bodies.forEach(function (b) { b.x *= sx; b.y *= sy; });
        }
    }

    function onDown(body, e) {
        if (pointerId !== null) return;
        pointerId = e.pointerId;
        dragging = body;
        body.el.style.cursor = 'grabbing';
        body.el.style.zIndex = '3';
        var rect = cluster.getBoundingClientRect();
        var px = e.clientX - rect.left;
        var py = e.clientY - rect.top;
        body.grab = {
            ox: px - body.x,
            oy: py - body.y,
            lastX: px, lastY: py,
            lastT: performance.now(),
            vx: 0, vy: 0
        };
        body.vx = 0; body.vy = 0;
        try { body.el.setPointerCapture(pointerId); } catch (_) {}
        e.preventDefault();
    }

    function onMove(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        var rect = cluster.getBoundingClientRect();
        var px = e.clientX - rect.left;
        var py = e.clientY - rect.top;
        var now = performance.now();
        var g = dragging.grab;
        var dt = Math.max(8, now - g.lastT);
        // Store recent pointer velocity for the fling
        g.vx = (px - g.lastX) / dt * 16;  // normalize to 60fps ticks
        g.vy = (py - g.lastY) / dt * 16;
        g.lastX = px; g.lastY = py; g.lastT = now;
        dragging.x = px - g.ox;
        dragging.y = py - g.oy;
    }

    function onUp(e) {
        if (!dragging || e.pointerId !== pointerId) return;
        dragging.el.style.cursor = 'grab';
        dragging.el.style.zIndex = '';
        var g = dragging.grab;
        // Fling: take last-frame pointer velocity, cap to prevent launching off-screen
        var max = 22;
        dragging.vx = clamp(g.vx, -max, max);
        dragging.vy = clamp(g.vy, -max, max);
        dragging.vRot = (Math.random() - 0.5) * 3 + dragging.vx * 0.1;
        try { dragging.el.releasePointerCapture(pointerId); } catch (_) {}
        dragging.grab = null;
        dragging = null;
        pointerId = null;
    }

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    function tick() {
        // Integrate
        for (var i = 0; i < bodies.length; i++) {
            var b = bodies[i];
            if (b === dragging) continue;
            b.x += b.vx;
            b.y += b.vy;
            // Friction
            b.vx *= 0.985;
            b.vy *= 0.985;
            // Rotational drift + decay
            b.rot += b.vRot;
            b.vRot *= 0.97;
            // Pull rotation gently back to baseline so icons don't tumble forever
            b.rot += (b.baseRot - b.rot) * 0.008;
            // Keep rotation bounded
            if (b.rot > 180) b.rot -= 360;
            if (b.rot < -180) b.rot += 360;
            // Wall collisions with damping
            var left = b.r, right = bounds.w - b.r;
            var top = b.r, botm = bounds.h - b.r;
            if (b.x < left)   { b.x = left;  b.vx = -b.vx * 0.7; hapticTap(Math.abs(b.vx)); }
            if (b.x > right)  { b.x = right; b.vx = -b.vx * 0.7; hapticTap(Math.abs(b.vx)); }
            if (b.y < top)    { b.y = top;   b.vy = -b.vy * 0.7; hapticTap(Math.abs(b.vy)); }
            if (b.y > botm)   { b.y = botm;  b.vy = -b.vy * 0.7; hapticTap(Math.abs(b.vy)); }
        }

        // Pairwise elastic collision (5 icons → 10 pairs)
        for (var i2 = 0; i2 < bodies.length; i2++) {
            for (var j = i2 + 1; j < bodies.length; j++) {
                resolveCollision(bodies[i2], bodies[j]);
            }
        }

        // Render
        for (var k = 0; k < bodies.length; k++) render(bodies[k]);
        requestAnimationFrame(tick);
    }

    function resolveCollision(a, b) {
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var dist2 = dx * dx + dy * dy;
        var min = a.r + b.r;
        if (dist2 >= min * min || dist2 === 0) return;
        var dist = Math.sqrt(dist2);
        var nx = dx / dist, ny = dy / dist;
        // Positional correction (split 50/50 unless one is being dragged)
        var pen = min - dist;
        if (a === dragging) {
            b.x += nx * pen;
            b.y += ny * pen;
        } else if (b === dragging) {
            a.x -= nx * pen;
            a.y -= ny * pen;
        } else {
            a.x -= nx * pen * 0.5;
            a.y -= ny * pen * 0.5;
            b.x += nx * pen * 0.5;
            b.y += ny * pen * 0.5;
        }
        // Relative velocity along the normal
        var rvx = b.vx - a.vx;
        var rvy = b.vy - a.vy;
        var relN = rvx * nx + rvy * ny;
        if (relN > 0) return; // moving apart
        var restitution = 0.85;
        var jImpulse = -(1 + restitution) * relN / 2; // equal mass
        var ix = jImpulse * nx, iy = jImpulse * ny;
        if (a !== dragging) { a.vx -= ix; a.vy -= iy; }
        if (b !== dragging) { b.vx += ix; b.vy += iy; }
        // Spin a bit on collision
        a.vRot += (Math.random() - 0.5) * 2;
        b.vRot += (Math.random() - 0.5) * 2;
        hapticTap(Math.abs(relN));
    }

    function render(b) {
        var tx = b.x - b.w / 2;
        var ty = b.y - b.h / 2;
        b.el.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) rotate(' + b.rot.toFixed(2) + 'deg)';
    }

    function hapticTap(magnitude) {
        if (!navigator.vibrate) return;
        if (magnitude < 1.2) return;
        var now = performance.now();
        if (now - lastVibrate < 60) return;
        lastVibrate = now;
        var ms = Math.min(25, Math.max(6, Math.round(magnitude * 2)));
        try { navigator.vibrate(ms); } catch (_) {}
    }
})();
