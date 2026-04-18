(function () {
    function initLangSelector() {
        var selector = document.getElementById('langSelector');
        if (!selector) return;

        var toggle = selector.querySelector('[data-lang-toggle]');
        if (toggle) {
            toggle.addEventListener('click', function () {
                selector.classList.toggle('open');
            });
        }

        selector.querySelectorAll('[data-lang-choose]').forEach(function (link) {
            link.addEventListener('click', function () {
                document.cookie = 'lang-chosen=1;path=/;max-age=31536000';
            });
        });

        document.addEventListener('click', function (e) {
            if (!selector.contains(e.target)) {
                selector.classList.remove('open');
            }
        });
    }

    function initCounters() {
        if (!('IntersectionObserver' in window)) return;
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var targets = document.querySelectorAll('[data-count]');
        if (!targets.length) return;

        targets.forEach(function (el) {
            var target = parseFloat(el.getAttribute('data-count'));
            if (isNaN(target)) return;
            var suffix = el.getAttribute('data-count-suffix') || '';
            var prefix = el.getAttribute('data-count-prefix') || '';
            var decimals = parseInt(el.getAttribute('data-count-decimals') || '0', 10);

            if (reduced) {
                el.textContent = prefix + target.toLocaleString(undefined, {
                    minimumFractionDigits: decimals, maximumFractionDigits: decimals
                }) + suffix;
                return;
            }

            var io = new IntersectionObserver(function (entries, obs) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    obs.unobserve(entry.target);
                    var start = null;
                    var duration = 1400;
                    function tick(now) {
                        if (!start) start = now;
                        var t = Math.min(1, (now - start) / duration);
                        var eased = 1 - Math.pow(1 - t, 3);
                        var val = target * eased;
                        el.textContent = prefix + val.toLocaleString(undefined, {
                            minimumFractionDigits: decimals, maximumFractionDigits: decimals
                        }) + suffix;
                        if (t < 1) requestAnimationFrame(tick);
                    }
                    requestAnimationFrame(tick);
                });
            }, { threshold: 0.5 });
            io.observe(el);
        });
    }

    function init() {
        initLangSelector();
        initCounters();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
