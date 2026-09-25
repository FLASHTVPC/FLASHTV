/* ============================================================
   🌊 FLASH TV - DEVICE SELECTOR
   يظهر أول مرة فقط ويحفظ اختيار المستخدم
   ============================================================ */
(function() {
    'use strict';

    var STORAGE_KEY = 'flash_tv_device_mode';
    var VALID_MODES = ['mobile', 'desktop'];

    /* ============================================================
       🔧 الدوال الأساسية
       ============================================================ */
    function getSavedMode() {
        try {
            var mode = localStorage.getItem(STORAGE_KEY);
            if (mode && VALID_MODES.indexOf(mode) !== -1) return mode;
        } catch (e) {}
        return null;
    }

    function saveMode(mode) {
        if (VALID_MODES.indexOf(mode) === -1) return;
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (e) {}
    }

    function applyMode(mode) {
        if (VALID_MODES.indexOf(mode) === -1) return;

        var body = document.body;
        if (!body) return;

        /* إزالة الكلاسات القديمة */
        body.classList.remove('device-mobile', 'device-desktop');

        /* إضافة الكلاس الجديد */
        body.classList.add('device-' + mode);

        /* إضافة data attribute للاستخدام في CSS */
        body.setAttribute('data-device', mode);

        console.log('[FLASH] ✅ تم تطبيق وضع الجهاز:', mode);
    }

    function showDeviceSelector() {
        var selector = document.getElementById('deviceSelector');
        if (!selector) {
            console.warn('[FLASH] ⚠️ deviceSelector غير موجود في HTML');
            /* في حالة عدم وجود الشاشة، نطبق تلقائياً */
            applyAutoDetectMode();
            return;
        }
        selector.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function hideDeviceSelector() {
        var selector = document.getElementById('deviceSelector');
        if (selector) {
            selector.classList.remove('show');
        }
        document.body.style.overflow = '';
    }

    function applyAutoDetectMode() {
        /* كشف تلقائي بحسب عرض الشاشة */
        var isMobile = window.innerWidth <= 768 ||
                       /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        var autoMode = isMobile ? 'mobile' : 'desktop';
        applyMode(autoMode);
        saveMode(autoMode);
        console.log('[FLASH] 🔄 تم التطبيق التلقائي:', autoMode);
    }

    /* ============================================================
       🎯 الأحداث (Events)
       ============================================================ */
    function init() {
        var savedMode = getSavedMode();

        if (savedMode) {
            /* المستخدم اختار من قبل → نطبق الاختيار مباشرة */
            applyMode(savedMode);
            console.log('[FLASH] 💾 استخدام الاختيار المحفوظ:', savedMode);
        } else {
            /* أول مرة → نعرض شاشة الاختيار */
            console.log('[FLASH] 🆕 أول زيارة - عرض شاشة اختيار الجهاز');
            showDeviceSelector();
        }

        /* إضافة event listeners للأزرار */
        bindButtons();
    }

    function bindButtons() {
        /* زر الهاتف */
        var mobileBtn = document.querySelector('[data-device-btn="mobile"]');
        if (mobileBtn) {
            mobileBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                selectMode('mobile');
            });
        }

        /* زر الشاشة */
        var desktopBtn = document.querySelector('[data-device-btn="desktop"]');
        if (desktopBtn) {
            desktopBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                selectMode('desktop');
            });
        }

        /* الضغط على الكارت كامل */
        document.querySelectorAll('.ds-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.closest('[data-device-btn]')) return;
                var mode = card.getAttribute('data-mode');
                if (mode) selectMode(mode);
            });
        });
    }

    function selectMode(mode) {
        if (VALID_MODES.indexOf(mode) === -1) return;

        console.log('[FLASH] 👆 اختيار المستخدم:', mode);
        saveMode(mode);
        applyMode(mode);
        hideDeviceSelector();

        /* رسالة نجاح */
        if (typeof window.toast === 'function') {
            var msg = mode === 'mobile' ? 'تم اختيار وضع الهاتف 📱' : 'تم اختيار وضع الشاشة 💻';
            window.toast(msg, 's');
        }

        /* إعادة رسم بعض العناصر بعد التغيير */
        setTimeout(function() {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    }

    /* ============================================================
       ⚙️ API عام (للإعدادات)
       ============================================================ */
    window.FlashTV_Device = {
        getMode: function() {
            return getSavedMode() || 'auto';
        },

        setMode: function(mode) {
            if (mode === 'auto') {
                try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
                applyAutoDetectMode();
                return;
            }
            selectMode(mode);
        },

        reset: function() {
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
            location.reload();
        },

        show: function() {
            showDeviceSelector();
        },

        isMobile: function() {
            return getSavedMode() === 'mobile';
        },

        isDesktop: function() {
            return getSavedMode() === 'desktop';
        }
    };

    /* ============================================================
       🚀 التشغيل
       ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, 50);
        });
    } else {
        setTimeout(init, 50);
    }

    console.log('[FLASH] 🌊 Device Selector loaded');
})();
