/* ============================================================
   FLASH TV - Advanced TV Remote Navigation System v3.0
   Ultimate Fix: Direct VS (Virtual Scroller) Integration
   Optimized for TV Box, Smart TVs, and all screen sizes
   ============================================================ */
(function(){
'use strict';

/* ============ الإعدادات ============ */
var TV_DEBUG = false;
var THROTTLE_MS = 60;
var NAV_SMOOTH_SCROLL = true;
var NAV_CIRCULAR = true;
var INITIAL_FOCUS_DELAY = 300;
var VS_WAIT_MS = 120;  // وقت انتظار Virtual Scroller لبناء العناصر

function log() {
    if (TV_DEBUG && window.console && console.log) {
        console.log.apply(console, arguments);
    }
}

/* ============ المحددات ============ */
var FOCUSABLE = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    '[role="button"]:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '.server-card',
    '.cat-item',
    '.ch-grid-item',
    '.media-grid-item',
    '.ch-box',
    '.media-box',
    '.ls-tile',
    '.ls-side-btn',
    '.match-card',
    '.ep-item',
    '.ep-play-btn',
    '.quick-btn',
    '.ctrl-btn',
    '.settings-select',
    '.toggle input'
].join(',');

/* ============ الحالة ============ */
var currentEl = null;
var _lastMoveTime = 0;
var _pendingFocus = null;

/* ============ Cache ============ */
var _cache = { items: null, time: 0, ttl: 200 };

function invalidateCache() {
    _cache.items = null;
    _cache.time = 0;
}

/* ============ جلب العناصر المرئية ============ */
function getVisibleItems(root, forceRefresh) {
    var now = Date.now();
    if (!forceRefresh && _cache.items && (now - _cache.time) < _cache.ttl) {
        return _cache.items;
    }
    root = root || document;
    var all = root.querySelectorAll(FOCUSABLE);
    var result = [];
    for (var i = 0; i < all.length; i++) {
        var el = all[i];
        try {
            if (el.disabled) continue;
            if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') continue;
            var style = window.getComputedStyle(el);
            if (style.display === 'none') continue;
            if (style.visibility === 'hidden') continue;
            if (parseFloat(style.opacity) === 0) continue;
            if (style.pointerEvents === 'none') continue;
            if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
            var rect = el.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) continue;
            result.push(el);
        } catch (e) {}
    }
    _cache.items = result;
    _cache.time = now;
    return result;
}

/* ============ مركز العنصر ============ */
function getCenter(el) {
    var r = el.getBoundingClientRect();
    return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        w: r.width,
        h: r.height,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right
    };
}

/* ============ التركيز ============ */
function setFocus(el, skipScroll) {
    if (!el) return;
    if (currentEl && currentEl.classList) {
        currentEl.classList.remove('tv-focus');
    }
    currentEl = el;
    el.classList.add('tv-focus');
    try {
        el.focus({ preventScroll: true });
    } catch (e) {
        try { el.focus(); } catch (e2) {}
    }
    if (!skipScroll && NAV_SMOOTH_SCROLL) {
        try {
            var rect = el.getBoundingClientRect();
            var scrollParent = findScrollParent(el);
            if (scrollParent) {
                var pRect = scrollParent.getBoundingClientRect();
                var offsetTop = rect.top - pRect.top;
                var offsetBottom = rect.bottom - pRect.bottom;
                if (offsetTop < 30) {
                    scrollParent.scrollTop += (offsetTop - 30);
                } else if (offsetBottom > -30) {
                    scrollParent.scrollTop += (offsetBottom + 30);
                }
            } else {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        } catch (e) {
            try { el.scrollIntoView(false); } catch (e2) {}
        }
    }
}

/* ============ الأب القابل للتمرير ============ */
function findScrollParent(el) {
    var p = el.parentElement;
    while (p && p !== document.body) {
        var s = window.getComputedStyle(p);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll') &&
            p.scrollHeight > p.clientHeight) {
            return p;
        }
        p = p.parentElement;
    }
    return null;
}

/* ============ البحث الاتجاهي ============ */
function findInDirection(fromEl, direction) {
    if (!fromEl) return null;
    var items = getVisibleItems();
    if (items.length === 0) return null;
    var from = getCenter(fromEl);
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el === fromEl) continue;
        var to = getCenter(el);
        var dx = to.x - from.x;
        var dy = to.y - from.y;
        var primaryDist, secondaryDist, isValid = false;
        if (direction === 'right') {
            if (dx > 5) { primaryDist = dx; secondaryDist = Math.abs(dy); isValid = true; }
        } else if (direction === 'left') {
            if (dx < -5) { primaryDist = -dx; secondaryDist = Math.abs(dy); isValid = true; }
        } else if (direction === 'down') {
            if (dy > 5) { primaryDist = dy; secondaryDist = Math.abs(dx); isValid = true; }
        } else if (direction === 'up') {
            if (dy < -5) { primaryDist = -dy; secondaryDist = Math.abs(dx); isValid = true; }
        }
        if (!isValid) continue;
        var parallelBonus = 0;
        if (direction === 'right' || direction === 'left') {
            if (Math.abs(dy) < from.h * 0.5) parallelBonus = -primaryDist * 0.4;
        } else {
            if (Math.abs(dx) < from.w * 0.5) parallelBonus = -primaryDist * 0.4;
        }
        var score = primaryDist + secondaryDist * 2.2 + parallelBonus;
        if (score < bestScore) {
            bestScore = score;
            best = el;
        }
    }
    if (!best && NAV_CIRCULAR) {
        if (direction === 'right') best = findExtreme(items, fromEl, 'minX');
        else if (direction === 'left') best = findExtreme(items, fromEl, 'maxX');
        else if (direction === 'down') best = findExtreme(items, fromEl, 'minY');
        else if (direction === 'up') best = findExtreme(items, fromEl, 'maxY');
    }
    return best;
}

function findExtreme(items, exclude, mode) {
    var best = null;
    var bestVal = (mode === 'minX' || mode === 'minY') ? Infinity : -Infinity;
    for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el === exclude) continue;
        var c = getCenter(el);
        var v = (mode === 'minX' || mode === 'maxX') ? c.x : c.y;
        if (mode === 'minX' || mode === 'minY') {
            if (v < bestVal) { bestVal = v; best = el; }
        } else {
            if (v > bestVal) { bestVal = v; best = el; }
        }
    }
    return best;
}

/* ============ المنطقة ============ */
function getRegion(el) {
    if (!el || !el.closest) return null;
    if (el.closest('#catPanel')) return 'catPanel';
    if (el.closest('#catListMob')) return 'catListMob';
    if (el.closest('#chPanel') || el.closest('#chList')) return 'chList';
    if (el.closest('#playerControls')) return 'playerControls';
    if (el.closest('#episodeOverlay')) return 'episodeOverlay';
    if (el.closest('#settingsModal')) return 'settingsModal';
    if (el.closest('#addServerModal')) return 'addServerModal';
    if (el.closest('#deleteConfirmModal')) return 'deleteConfirmModal';
    if (el.closest('#telegram-notification')) return 'telegramNotif';
    if (el.closest('#profileSelection')) return 'profileSelection';
    if (el.closest('#mainHeader')) return 'header';
    if (el.closest('#mobileNav')) return 'mobileNav';
    if (el.closest('#homePanel')) return 'homePanel';
    if (el.closest('#matchesPanel')) return 'matchesPanel';
    if (el.closest('#catDrawer')) return 'catDrawer';
    if (el.closest('#floatingAdOverlay')) return 'floatingAd';
    if (el.closest('#playerOverlay')) return 'playerOverlay';
    return 'other';
}

/* ================================================================
   ============ الحل الجذري: التواصل مع VS مباشرة ============
   ================================================================ */

/* جلب أول عنصر مرئي داخل chList */
function getFirstChListItem() {
    var chList = document.getElementById('chList');
    if (!chList) return null;

    // 1) حاول استخدام VS إذا كان متاحاً
    if (window.VS && window.VS.items && window.VS.items.length > 0) {
        // VS منشئ العناصر فقط عند التمرير
        // scrollTo(0) يعيد التمرير لأول عنصر
        try { window.VS.scrollTo(0); } catch (e) {}
    }

    // 2) ابحث عن أي عنصر مرئي بأي من الفئات المحتملة
    var selectors = ['.ch-grid-item', '.media-grid-item', '.ch-box', '.media-box'];
    for (var s = 0; s < selectors.length; s++) {
        var items = chList.querySelectorAll(selectors[s]);
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var st = window.getComputedStyle(el);
            if (st.display !== 'none' && st.visibility !== 'hidden' &&
                el.offsetWidth > 0 && el.offsetHeight > 0) {
                return el;
            }
        }
    }

    // 3) ابحث داخل .vs-inner بشكل خاص
    var inner = chList.querySelector('.vs-inner');
    if (inner) {
        var children = inner.children;
        for (var j = 0; j < children.length; j++) {
            var c = children[j];
            if (c.offsetWidth > 0 && c.offsetHeight > 0) return c;
        }
    }

    return null;
}

/* الانتقال من catPanel إلى chList مع انتظار VS */
function goFromCatToChannels() {
    // المسار 1: حاول فوراً
    var first = getFirstChListItem();
    if (first) {
        setFocus(first);
        return true;
    }

    // المسار 2: انتظر VS يبني العناصر ثم حاول مرة أخرى
    if (window.VS && window.VS.items && window.VS.items.length > 0) {
        // VS موجود لكنه لم يبنِ العناصر بعد
        // scrollTo(0) يجبره على البناء
        try { window.VS.scrollTo(0); } catch (e) {}

        setTimeout(function() {
            var retry = getFirstChListItem();
            if (retry) {
                setFocus(retry);
            } else {
                // محاولة أخيرة بعد وقت أطول
                setTimeout(function() {
                    var retry2 = getFirstChListItem();
                    if (retry2) setFocus(retry2);
                }, VS_WAIT_MS * 2);
            }
        }, VS_WAIT_MS);

        return true;
    }

    // المسار 3: لا VS — قد تكون القنوات غير محمّلة بعد
    // انتظر قليلاً ثم حاول
    setTimeout(function() {
        var retry = getFirstChListItem();
        if (retry) setFocus(retry);
    }, VS_WAIT_MS);

    return true;
}

/* الانتقال من chList إلى catPanel */
function goFromChannelsToCat(isMobile) {
    var targetId = isMobile ? 'catListMob' : 'catList';
    var catList = document.getElementById(targetId);
    if (!catList) {
        // جرّب الاثنين
        catList = document.getElementById('catList') || document.getElementById('catListMob');
    }
    if (!catList) return false;

    // ابحث عن النشط
    var active = catList.querySelector('.cat-item.active');
    if (active && active.offsetWidth > 0 && active.offsetHeight > 0) {
        setFocus(active);
        return true;
    }
    // ابحث عن آخر عنصر مرئي
    var items = catList.querySelectorAll('.cat-item');
    for (var i = items.length - 1; i >= 0; i--) {
        var el = items[i];
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            setFocus(el);
            return true;
        }
    }
    return false;
}

/* ============ معالجة الأسهم ============ */
function moveFocus(direction) {
    var now = Date.now();
    if (now - _lastMoveTime < THROTTLE_MS) return;
    _lastMoveTime = now;

    if (!currentEl) {
        var all = getVisibleItems();
        if (all.length > 0) setFocus(all[0]);
        return;
    }

    var region = getRegion(currentEl);

    /* -------- يمين من قائمة التصنيفات → القنوات -------- */
    if (direction === 'right' && (region === 'catPanel' || region === 'catListMob')) {
        if (goFromCatToChannels()) return;
    }

    /* -------- شمال من القنوات → قائمة التصنيفات -------- */
    if (direction === 'left' && region === 'chList') {
        var isMobile = window.innerWidth <= 768;
        if (goFromChannelsToCat(isMobile)) return;
    }

    /* -------- من الهيدر → المحتوى -------- */
    if (direction === 'down' && region === 'header') {
        var appShell = document.getElementById('appShell');
        if (appShell && appShell.classList.contains('show')) {
            var panels = getVisibleItems(appShell, true);
            if (panels.length > 0) { setFocus(panels[0]); return; }
        }
    }

    /* -------- البحث الاتجاهي العام -------- */
    var next = findInDirection(currentEl, direction);
    if (next) {
        setFocus(next);
    }
}

/* ============ التفعيل ============ */
function activateCurrent() {
    if (!currentEl) return;
    try { currentEl.click(); return; } catch (e) {}
    try {
        var evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        currentEl.dispatchEvent(evt);
        return;
    } catch (e) {}
    try {
        var kEvt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        currentEl.dispatchEvent(kEvt);
    } catch (e) {}
}

/* ============ لوحة المفاتيح ============ */
document.addEventListener('keydown', function(e) {
    var key = e.key || '';
    var code = e.keyCode || e.which || 0;

    var isRight = key === 'ArrowRight' || key === 'Right' || code === 39;
    var isLeft = key === 'ArrowLeft' || key === 'Left' || code === 37;
    var isDown = key === 'ArrowDown' || key === 'Down' || code === 40;
    var isUp = key === 'ArrowUp' || key === 'Up' || code === 38;
    var isEnter = key === 'Enter' || key === 'NumpadEnter' || key === 'OK' || key === 'Select' || code === 13;
    var isBack = key === 'Escape' || key === 'Backspace' || key === 'BrowserBack' || key === 'GoBack' || code === 27 || code === 8 || code === 461 || code === 10009 || code === 166;
    var isHome = key === 'Home' || code === 36;
    var isEnd = key === 'End' || code === 35;
    var isPageDown = key === 'PageDown' || code === 34;
    var isPageUp = key === 'PageUp' || code === 33;

    var active = document.activeElement;
    var tag = active ? active.tagName : '';
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !isEnter) {
        if (isRight || isLeft || isUp || isDown) return;
    }

    if (isRight) { e.preventDefault(); e.stopPropagation(); moveFocus('right'); }
    else if (isLeft) { e.preventDefault(); e.stopPropagation(); moveFocus('left'); }
    else if (isDown || isPageDown) { e.preventDefault(); e.stopPropagation(); moveFocus('down'); }
    else if (isUp || isPageUp) { e.preventDefault(); e.stopPropagation(); moveFocus('up'); }
    else if (isEnter) { e.preventDefault(); e.stopPropagation(); activateCurrent(); }
    else if (isBack) {
        e.preventDefault(); e.stopPropagation();
        if (typeof window.FlashTV_BackHandler === 'function') window.FlashTV_BackHandler();
    }
    else if (isHome) { e.preventDefault(); var i1 = getVisibleItems(); if (i1.length > 0) setFocus(i1[0]); }
    else if (isEnd) { e.preventDefault(); var i2 = getVisibleItems(); if (i2.length > 0) setFocus(i2[i2.length - 1]); }
}, true);

/* ============ الماوس ============ */
document.addEventListener('mouseover', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest(FOCUSABLE);
    if (!el || el === currentEl) return;
    if (currentEl && currentEl.classList) currentEl.classList.remove('tv-focus');
    currentEl = el;
    el.classList.add('tv-focus');
}, false);

/* ============ التركيز الابتدائي ============ */
function initialFocus() {
    setTimeout(function() {
        if (!currentEl) {
            var items = getVisibleItems(null, true);
            if (items.length > 0) setFocus(items[0]);
        }
    }, INITIAL_FOCUS_DELAY);
}
if (document.readyState === 'complete') initialFocus();
else window.addEventListener('load', initialFocus);

/* ============ مراقبة DOM ============ */
if (window.MutationObserver) {
    var _mutateTimer = null;
    var observer = new MutationObserver(function() {
        invalidateCache();
        if (currentEl && !document.body.contains(currentEl)) {
            currentEl = null;
            clearTimeout(_mutateTimer);
            _mutateTimer = setTimeout(function() {
                var items = getVisibleItems(null, true);
                if (items.length > 0) setFocus(items[0]);
            }, 200);
        }
    });
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'disabled']
    });
}

/* ============ resize ============ */
var _resizeTimer = null;
window.addEventListener('resize', function() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
        invalidateCache();
        if (currentEl && document.body.contains(currentEl)) setFocus(currentEl, true);
    }, 200);
});

/* ============ scroll ============ */
window.addEventListener('scroll', function() { invalidateCache(); }, { passive: true, capture: true });

/* ============ API عام ============ */
window.FlashTV_Nav = {
    focusFirst: function() {
        var items = getVisibleItems(null, true);
        if (items.length > 0) setFocus(items[0]);
    },
    focusElement: setFocus,
    move: moveFocus,
    activate: activateCurrent,
    refresh: invalidateCache,
    goToChannels: goFromCatToChannels,
    goToCategories: function() { return goFromChannelsToCat(window.innerWidth <= 768); },
    getCurrent: function() { return currentEl; }
};

log('✅ FLASH TV Nav v3.0 loaded - VS integrated');

})();
