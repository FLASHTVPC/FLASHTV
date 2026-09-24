/* ============================================================
   FLASH TV - Advanced TV Remote Navigation System v2.0
   Optimized for TV Box, Smart TVs, and all screen sizes
   ============================================================ */
(function(){
'use strict';

/* ============ الإعدادات ============ */
var TV_DEBUG = false;
var THROTTLE_MS = 80;         // منع تكرار ضغطات الأسهم السريعة
var NAV_SMOOTH_SCROLL = true; // تمرير سلس
var NAV_CIRCULAR = true;      // تنقل دائري عند الوصول للحافة
var INITIAL_FOCUS_DELAY = 300;

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
var _isScrolling = false;
var _domObserver = null;

/* ============ Cache للعناصر المرئية ============ */
var _cache = { items: null, time: 0, ttl: 250 };

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
            // تجاهل العناصر خارج الشاشة
            if (rect.bottom < -50 || rect.top > window.innerHeight + 50) {
                // احتفظ بها إذا كانت داخل منطقة قابلة للتمرير
                var inScrollable = false;
                var p = el.parentElement;
                while (p) {
                    var ps = window.getComputedStyle(p);
                    if (ps.overflowY === 'auto' || ps.overflowY === 'scroll') {
                        inScrollable = true;
                        break;
                    }
                    p = p.parentElement;
                }
                if (!inScrollable) continue;
            }
            result.push(el);
        } catch (e) { /* تجاهل */ }
    }

    _cache.items = result;
    _cache.time = now;
    return result;
}

/* ============ الحصول على مركز العنصر ============ */
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

/* ============ تطبيق التركيز ============ */
function setFocus(el, skipScroll) {
    if (!el) return;
    if (currentEl && currentEl.classList) {
        currentEl.classList.remove('tv-focus');
    }
    currentEl = el;
    el.classList.add('tv-focus');

    // محاولة focus مع preventScroll
    try {
        el.focus({ preventScroll: true });
    } catch (e) {
        try { el.focus(); } catch (e2) {}
    }

    // تمرير مركزي ذكي
    if (!skipScroll && NAV_SMOOTH_SCROLL) {
        try {
            var rect = el.getBoundingClientRect();
            var scrollParent = findScrollParent(el);
            if (scrollParent) {
                var pRect = scrollParent.getBoundingClientRect();
                var offsetTop = rect.top - pRect.top;
                var offsetBottom = rect.bottom - pRect.bottom;

                if (offsetTop < 30) {
                    // العنصر أعلى من الرؤية → مرره لأعلى
                    scrollParent.scrollTop += (offsetTop - 30);
                } else if (offsetBottom > -30) {
                    // العنصر أسفل من الرؤية → مرره لأسفل
                    scrollParent.scrollTop += (offsetBottom + 30);
                }
            } else {
                el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
        } catch (e) {
            try { el.scrollIntoView(false); } catch (e2) {}
        }
    }
}

/* ============ إيجاد أقرب أب قابل للتمرير ============ */
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

/* ============ البحث الاتجاهي المتقدم ============ */
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

        // وزن ذكي: العناصر في نفس الصف/العمود لها أولوية أعلى
        var parallelBonus = 0;
        if (direction === 'right' || direction === 'left') {
            // نفس الصف تقريباً (فرق رأسي < نصف ارتفاع العنصر)
            if (Math.abs(dy) < from.h * 0.5) parallelBonus = -primaryDist * 0.4;
        } else {
            // نفس العمود تقريباً
            if (Math.abs(dx) < from.w * 0.5) parallelBonus = -primaryDist * 0.4;
        }

        var score = primaryDist + secondaryDist * 2.2 + parallelBonus;

        if (score < bestScore) {
            bestScore = score;
            best = el;
        }
    }

    // التنقل الدائري
    if (!best && NAV_CIRCULAR) {
        if (direction === 'right') {
            // أول عنصر في أقصى اليسار
            best = findExtreme(items, fromEl, 'minX');
        } else if (direction === 'left') {
            best = findExtreme(items, fromEl, 'maxX');
        } else if (direction === 'down') {
            best = findExtreme(items, fromEl, 'minY');
        } else if (direction === 'up') {
            best = findExtreme(items, fromEl, 'maxY');
        }
    }

    return best;
}

/* ============ إيجاد العنصر الأقصى في اتجاه معين ============ */
function findExtreme(items, exclude, mode) {
    var best = null;
    var bestVal = mode === 'minX' || mode === 'minY' ? Infinity : -Infinity;
    for (var i = 0; i < items.length; i++) {
        var el = items[i];
        if (el === exclude) continue;
        var c = getCenter(el);
        var v = mode === 'minX' ? c.x : mode === 'maxX' ? c.x : mode === 'minY' ? c.y : c.y;
        if (mode === 'minX' || mode === 'minY') {
            if (v < bestVal) { bestVal = v; best = el; }
        } else {
            if (v > bestVal) { bestVal = v; best = el; }
        }
    }
    return best;
}

/* ============ تحديد منطقة العنصر ============ */
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

/* ============ معالجة الأسهم ============ */
function moveFocus(direction) {
    var now = Date.now();
    if (now - _lastMoveTime < THROTTLE_MS) {
        log('throttled');
        return;
    }
    _lastMoveTime = now;

    // إذا لم يكن هناك عنصر محدد، اختر الأول
    if (!currentEl) {
        var all = getVisibleItems();
        if (all.length > 0) setFocus(all[0]);
        return;
    }

    var region = getRegion(currentEl);

    /* -------- منطق خاص: قائمة التصنيفات → القنوات -------- */
    if (direction === 'right' && (region === 'catPanel' || region === 'catListMob')) {
        var chList = document.getElementById('chList');
        if (chList) {
            var chItems = getVisibleItems(chList, true);
            if (chItems.length > 0) {
                setFocus(chItems[0]);
                return;
            }
        }
    }

    /* -------- منطق خاص: القنوات → قائمة التصنيفات -------- */
    if (direction === 'left' && region === 'chList') {
        var isMobile = window.innerWidth <= 768;
        if (isMobile) {
            var mobList = document.getElementById('catListMob');
            if (mobList) {
                var activeMob = mobList.querySelector('.cat-item.active');
                if (activeMob) { setFocus(activeMob); return; }
                var mobItems = getVisibleItems(mobList, true);
                if (mobItems.length > 0) { setFocus(mobItems[mobItems.length - 1]); return; }
            }
        } else {
            var catList = document.getElementById('catList');
            if (catList) {
                var active = catList.querySelector('.cat-item.active');
                if (active) { setFocus(active); return; }
                var catItems = getVisibleItems(catList, true);
                if (catItems.length > 0) { setFocus(catItems[catItems.length - 1]); return; }
            }
        }
    }

    /* -------- منطق خاص: من الهيدر → المحتوى -------- */
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
    } else {
        log('no element in direction:', direction);
    }
}

/* ============ تفعيل العنصر ============ */
function activateCurrent() {
    if (!currentEl) return;

    var el = currentEl;

    // محاولة click عادي
    try {
        el.click();
        return;
    } catch (e) {
        log('click() failed', e);
    }

    // محاولة MouseEvent
    try {
        var evt = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        el.dispatchEvent(evt);
        return;
    } catch (e) {
        log('MouseEvent failed', e);
    }

    // محاولة TouchEvent
    try {
        var touch = new Touch({
            identifier: Date.now(),
            target: el,
            clientX: 0,
            clientY: 0
        });
        var tEvt = new TouchEvent('touchend', {
            bubbles: true,
            cancelable: true,
            touches: [],
            targetTouches: [],
            changedTouches: [touch]
        });
        el.dispatchEvent(tEvt);
    } catch (e) {
        // آخر حل: Enter keydown
        try {
            var kEvt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            el.dispatchEvent(kEvt);
        } catch (e2) {}
    }
}

/* ============ معالجة ضغطات المفاتيح ============ */
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

    // تجاهل الأسهم داخل input
    var active = document.activeElement;
    var tag = active ? active.tagName : '';
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !isEnter) {
        if (isRight || isLeft || isUp || isDown) return;
    }

    if (isRight) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus('right');
    } else if (isLeft) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus('left');
    } else if (isDown || isPageDown) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus('down');
    } else if (isUp || isPageUp) {
        e.preventDefault();
        e.stopPropagation();
        moveFocus('up');
    } else if (isEnter) {
        e.preventDefault();
        e.stopPropagation();
        activateCurrent();
    } else if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.FlashTV_BackHandler === 'function') {
            window.FlashTV_BackHandler();
        }
    } else if (isHome) {
        e.preventDefault();
        var items = getVisibleItems();
        if (items.length > 0) setFocus(items[0]);
    } else if (isEnd) {
        e.preventDefault();
        var items2 = getVisibleItems();
        if (items2.length > 0) setFocus(items2[items2.length - 1]);
    }
}, true);

/* ============ تحديث currentEl عند تمرير الماوس ============ */
document.addEventListener('mouseover', function(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest(FOCUSABLE);
    if (!el) return;
    if (currentEl === el) return;

    var items = getVisibleItems();
    for (var i = 0; i < items.length; i++) {
        if (items[i] === el) {
            if (currentEl && currentEl.classList) currentEl.classList.remove('tv-focus');
            currentEl = el;
            el.classList.add('tv-focus');
            return;
        }
    }
}, false);

/* ============ عند تحميل الصفحة ============ */
function initialFocus() {
    setTimeout(function() {
        if (!currentEl) {
            var items = getVisibleItems(null, true);
            if (items.length > 0) setFocus(items[0]);
        }
    }, INITIAL_FOCUS_DELAY);
}

if (document.readyState === 'complete') {
    initialFocus();
} else {
    window.addEventListener('load', initialFocus);
}

/* ============ مراقبة DOM لتحديث Cache ============ */
if (window.MutationObserver) {
    var _mutateTimer = null;
    _domObserver = new MutationObserver(function() {
        invalidateCache();
        // إذا اختفى العنصر الحالي، ابحث عن بديل
        if (currentEl && !document.body.contains(currentEl)) {
            currentEl = null;
            clearTimeout(_mutateTimer);
            _mutateTimer = setTimeout(function() {
                var items = getVisibleItems(null, true);
                if (items.length > 0) setFocus(items[0]);
            }, 200);
        }
    });
    _domObserver.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'disabled']
    });
}

/* ============ مراقبة تغيير حجم الشاشة ============ */
var _resizeTimer = null;
window.addEventListener('resize', function() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
        invalidateCache();
        if (currentEl && document.body.contains(currentEl)) {
            setFocus(currentEl, true);
        }
    }, 200);
});

/* ============ مراقبة تغيير التمرير ============ */
window.addEventListener('scroll', function() {
    invalidateCache();
}, { passive: true, capture: true });

/* ============ كشف فشل الصور ============ */
window.addEventListener('error', function(e) {
    if (e.target && e.target.tagName === 'IMG') {
        invalidateCache();
    }
}, true);

/* ============ تصدير API عام للاستخدام الخارجي ============ */
window.FlashTV_Nav = {
    focusFirst: function() {
        var items = getVisibleItems(null, true);
        if (items.length > 0) setFocus(items[0]);
    },
    focusElement: setFocus,
    move: moveFocus,
    activate: activateCurrent,
    refresh: invalidateCache,
    getCurrent: function() { return currentEl; }
};

log('✅ FLASH TV Nav v2.0 loaded - advanced navigation ready');

})();
