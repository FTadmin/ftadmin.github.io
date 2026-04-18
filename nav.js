(function () {
    function init() {
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
