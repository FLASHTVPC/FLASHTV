/* ============================================================
   FLASH TV - Advanced TV Remote Navigation System v3.2
   MERGED & FINAL:
   ✓ Android D-pad keycodes (19/20/21/22) + e.code + e.key
   ✓ Per-direction throttle + repeat-aware
   ✓ WebView native bridge (postMessage + handleNativeKey)
   ✓ tabindex injection for custom divs
   ✓ Force-refresh cache + currentEl sync + rAF focus verify
   ✓ passive:false for TV WebView preventDefault
   ============================================================ */
(function(){
'use strict';

var TV_DEBUG = false;
var THROTTLE_MS = 30;
var REPEAT_THROTTLE_MS = 90;
var NAV_SMOOTH_SCROLL = true;
var NAV_CIRCULAR = true;
var INITIAL_FOCUS_DELAY = 350;
var VS_WAIT_MS = 100;
var VS_MAX_RETRIES = 8;

function log(){ if(TV_DEBUG&&window.console&&console.log) console.log.apply(console,arguments); }

var FOCUSABLE_SELECTORS = [
    'button:not([disabled])','a[href]','input:not([disabled])','select:not([disabled])',
    '[role="button"]:not([disabled])','[tabindex]:not([tabindex="-1"])',
    '.server-card','.cat-item','.ch-grid-item','.media-grid-item','.ch-box','.media-box',
    '.ls-tile','.ls-side-btn','.match-card','.ep-item','.ep-play-btn','.quick-btn',
    '.ctrl-btn','.settings-select','.toggle input'
];
var FOCUSABLE = FOCUSABLE_SELECTORS.join(',');

var CUSTOM_CLASSES_NEED_TABINDEX = [
    'server-card','cat-item','ch-grid-item','media-grid-item','ch-box',
    'media-box','ls-tile','ls-side-btn','match-card','ep-item',
    'ep-play-btn','quick-btn','ctrl-btn'
];

var currentEl = null;
var _lastMoveTime = 0;
var _lastDir = '';

var _cache = { items:null, time:0, ttl:80 };
function invalidateCache(){ _cache.items=null; _cache.time=0; }

function ensureFocusable(root){
    root = root || document;
    for(var i=0;i<CUSTOM_CLASSES_NEED_TABINDEX.length;i++){
        var els = root.getElementsByClassName(CUSTOM_CLASSES_NEED_TABINDEX[i]);
        for(var j=0;j<els.length;j++){
            if(!els[j].hasAttribute('tabindex')) els[j].setAttribute('tabindex','0');
        }
    }
}

function getVisibleItems(root, forceRefresh){
    var now = Date.now();
    if(!forceRefresh && _cache.items && (now-_cache.time)<_cache.ttl) return _cache.items;
    root = root || document;
    ensureFocusable(root);
    var all = root.querySelectorAll(FOCUSABLE);
    var result = [];
    for(var i=0;i<all.length;i++){
        var el = all[i];
        try{
            if(el.disabled) continue;
            if(el.getAttribute && el.getAttribute('aria-hidden')==='true') continue;
            var style = window.getComputedStyle(el);
            if(style.display==='none'||style.visibility==='hidden') continue;
            if(parseFloat(style.opacity)===0) continue;
            if(style.pointerEvents==='none') continue;
            if(el.offsetWidth===0||el.offsetHeight===0) continue;
            var rect = el.getBoundingClientRect();
            if(rect.width<2||rect.height<2) continue;
            result.push(el);
        }catch(e){}
    }
    _cache.items = result; _cache.time = now;
    return result;
}

function getCenter(el){
    var r = el.getBoundingClientRect();
    return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height,
             top:r.top, bottom:r.bottom, left:r.left, right:r.right };
}

function findScrollParent(el){
    var p = el.parentElement;
    while(p && p!==document.body){
        var s = window.getComputedStyle(p);
        if((s.overflowY==='auto'||s.overflowY==='scroll') && p.scrollHeight>p.clientHeight) return p;
        p = p.parentElement;
    }
    return null;
}

function setFocus(el, skipScroll){
    if(!el || !el.classList) return false;
    if(currentEl && currentEl!==el){
        try{ currentEl.classList.remove('tv-focus'); }catch(e){}
    }
    currentEl = el;
    try{ el.classList.add('tv-focus'); }catch(e){}
    if(el.tabIndex===undefined || el.tabIndex<0){
        if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
    }
    try{ el.focus({preventScroll:true}); }
    catch(e){ try{ el.focus(); }catch(e2){} }
    if(document.activeElement !== el){
        requestAnimationFrame(function(){
            try{ el.focus({preventScroll:true}); }catch(e){ try{ el.focus(); }catch(e2){} }
        });
    }
    if(!skipScroll && NAV_SMOOTH_SCROLL){
        try{
            var rect = el.getBoundingClientRect();
            var sp = findScrollParent(el);
            if(sp){
                var pRect = sp.getBoundingClientRect();
                var offTop = rect.top - pRect.top;
                var offBot = rect.bottom - pRect.bottom;
                if(offTop < 30) sp.scrollTop += (offTop - 30);
                else if(offBot > -30) sp.scrollTop += (offBot + 30);
            } else {
                el.scrollIntoView({block:'nearest', inline:'nearest'});
            }
        }catch(e){ try{ el.scrollIntoView(false); }catch(e2){} }
    }
    invalidateCache();
    return true;
}

function findInDirection(fromEl, direction){
    if(!fromEl) return null;
    var items = getVisibleItems(document, true);
    if(items.length===0) return null;
    var from = getCenter(fromEl);
    var best = null, bestScore = Infinity;
    for(var i=0;i<items.length;i++){
        var el = items[i];
        if(el===fromEl) continue;
        var to = getCenter(el);
        var dx = to.x-from.x, dy = to.y-from.y;
        var p, s, ok=false;
        if(direction==='right'){ if(dx>5){ p=dx; s=Math.abs(dy); ok=true; } }
        else if(direction==='left'){ if(dx<-5){ p=-dx; s=Math.abs(dy); ok=true; } }
        else if(direction==='down'){ if(dy>5){ p=dy; s=Math.abs(dx); ok=true; } }
        else if(direction==='up'){ if(dy<-5){ p=-dy; s=Math.abs(dx); ok=true; } }
        if(!ok) continue;
        var pb = 0;
        if(direction==='right'||direction==='left'){
            if(Math.abs(dy) < from.h*0.5) pb = -p*0.4;
        } else {
            if(Math.abs(dx) < from.w*0.5) pb = -p*0.4;
        }
        var score = p + s*2.2 + pb;
        if(score < bestScore){ bestScore=score; best=el; }
    }
    if(!best && NAV_CIRCULAR){
        if(direction==='right') best = findExtreme(items, fromEl, 'minX');
        else if(direction==='left') best = findExtreme(items, fromEl, 'maxX');
        else if(direction==='down') best = findExtreme(items, fromEl, 'minY');
        else if(direction==='up') best = findExtreme(items, fromEl, 'maxY');
    }
    return best;
}

function findExtreme(items, exclude, mode){
    var best=null, bestVal = (mode==='minX'||mode==='minY')?Infinity:-Infinity;
    for(var i=0;i<items.length;i++){
        var el=items[i]; if(el===exclude) continue;
        var c=getCenter(el);
        var v = (mode==='minX'||mode==='maxX')?c.x:c.y;
        if(mode==='minX'||mode==='minY'){ if(v<bestVal){ bestVal=v; best=el; } }
        else { if(v>bestVal){ bestVal=v; best=el; } }
    }
    return best;
}

function getRegion(el){
    if(!el||!el.closest) return null;
    if(el.closest('#catPanel')) return 'catPanel';
    if(el.closest('#catListMob')) return 'catListMob';
    if(el.closest('#chPanel')||el.closest('#chList')) return 'chList';
    if(el.closest('#playerControls')) return 'playerControls';
    if(el.closest('#episodeOverlay')) return 'episodeOverlay';
    if(el.closest('#settingsModal')) return 'settingsModal';
    if(el.closest('#addServerModal')) return 'addServerModal';
    if(el.closest('#deleteConfirmModal')) return 'deleteConfirmModal';
    if(el.closest('#telegram-notification')) return 'telegramNotif';
    if(el.closest('#profileSelection')) return 'profileSelection';
    if(el.closest('#mainHeader')) return 'header';
    if(el.closest('#mobileNav')) return 'mobileNav';
    if(el.closest('#homePanel')) return 'homePanel';
    if(el.closest('#matchesPanel')) return 'matchesPanel';
    if(el.closest('#catDrawer')) return 'catDrawer';
    if(el.closest('#floatingAdOverlay')) return 'floatingAd';
    if(el.closest('#playerOverlay')) return 'playerOverlay';
    return 'other';
}

function getFirstChListItem(){
    var chList = document.getElementById('chList');
    if(!chList) return null;
    var selectors = ['.ch-grid-item','.media-grid-item','.ch-box','.media-box'];
    for(var s=0;s<selectors.length;s++){
        var items = chList.querySelectorAll(selectors[s]);
        for(var i=0;i<items.length;i++){
            var el=items[i], st=window.getComputedStyle(el);
            if(st.display!=='none'&&st.visibility!=='hidden'&&el.offsetWidth>0&&el.offsetHeight>0) return el;
        }
    }
    var inner = chList.querySelector('.vs-inner');
    if(inner){
        var ch = inner.children;
        for(var j=0;j<ch.length;j++){ if(ch[j].offsetWidth>0&&ch[j].offsetHeight>0) return ch[j]; }
    }
    return null;
}

function goFromCatToChannels(){
    var first = getFirstChListItem();
    if(first) return setFocus(first);
    if(window.VS && typeof window.VS.scrollTo === 'function'){
        try{ window.VS.scrollTo(0); }catch(e){}
    }
    var attempts = 0;
    function retryLoop(){
        attempts++;
        invalidateCache();
        var el = getFirstChListItem();
        if(el){ setFocus(el); return; }
        if(attempts < VS_MAX_RETRIES) setTimeout(retryLoop, VS_WAIT_MS);
        else log('⚠️ chList elements not found after', VS_MAX_RETRIES, 'retries');
    }
    setTimeout(retryLoop, VS_WAIT_MS);
    return true;
}

function goFromChannelsToCat(isMobile){
    var targetId = isMobile?'catListMob':'catList';
    var catList = document.getElementById(targetId) ||
                  document.getElementById('catList') ||
                  document.getElementById('catListMob');
    if(!catList) return false;
    var active = catList.querySelector('.cat-item.active');
    if(active && active.offsetWidth>0 && active.offsetHeight>0) return setFocus(active);
    var items = catList.querySelectorAll('.cat-item');
    for(var i=items.length-1;i>=0;i--){
        var el=items[i];
        if(el.offsetWidth>0&&el.offsetHeight>0) return setFocus(el);
    }
    return false;
}

function moveFocus(direction, isRepeat){
    var now = Date.now();
    var minGap = isRepeat ? REPEAT_THROTTLE_MS : THROTTLE_MS;
    /* per-direction throttle: نفس الاتجاه يُكتم، الاتجاه المعاكس يمر */
    if(direction===_lastDir && (now-_lastMoveTime)<minGap) return;
    _lastMoveTime = now;
    _lastDir = direction;

    /* مزامنة currentEl مع activeElement */
    if((!currentEl || !document.body.contains(currentEl)) &&
       document.activeElement && document.activeElement!==document.body){
        currentEl = document.activeElement;
    }
    if(!currentEl || !document.body.contains(currentEl)){
        var all = getVisibleItems(document, true);
        if(all.length>0) setFocus(all[0]);
        return;
    }

    var region = getRegion(currentEl);

    if(direction==='right' && (region==='catPanel'||region==='catListMob')){
        if(goFromCatToChannels()) return;
    }
    if(direction==='left' && region==='chList'){
        if(goFromChannelsToCat(window.innerWidth<=768)) return;
    }
    if(direction==='down' && region==='header'){
        var appShell = document.getElementById('appShell');
        if(appShell && appShell.classList.contains('show')){
            var panels = getVisibleItems(appShell, true);
            if(panels.length>0){ setFocus(panels[0]); return; }
        }
    }

    var next = findInDirection(currentEl, direction);
    if(next) setFocus(next);
}

function activateCurrent(){
    if(!currentEl) return;
    try{ currentEl.click(); return; }catch(e){}
    try{
        var evt = new MouseEvent('click',{bubbles:true,cancelable:true,view:window});
        currentEl.dispatchEvent(evt); return;
    }catch(e){}
    try{
        var kEvt = new KeyboardEvent('keydown',{key:'Enter',bubbles:true});
        currentEl.dispatchEvent(kEvt);
    }catch(e){}
}

/* ============ KEY HANDLING (الإصلاح الرئيسي) ============ */
function handleNavKey(e){
    if(e.isComposing) return;
    var key  = e.key || '';
    var code = e.keyCode || e.which || 0;
    var ec   = e.code || '';

    /* دعم كل الحالات:
       - Web عادي: 37/38/39/40 + ArrowRight/Left/Up/Down
       - Android TV D-pad: 19/20/21/22
       - e.code (لمّا e.key = 'Unidentified') */
    var isRight = key==='ArrowRight'||key==='Right'||code===39||code===22||ec==='ArrowRight';
    var isLeft  = key==='ArrowLeft' ||key==='Left' ||code===37||code===21||ec==='ArrowLeft';
    var isDown  = key==='ArrowDown' ||key==='Down' ||code===40||code===20||ec==='ArrowDown';
    var isUp    = key==='ArrowUp'   ||key==='Up'   ||code===38||code===19||ec==='ArrowUp';
    var isEnter = key==='Enter'||key==='NumpadEnter'||key==='OK'||key==='Select'||key==='Accept'||key==='Go'
                  ||code===13||code===23||ec==='Enter'||ec==='NumpadEnter'||ec==='Space'
                  ||key===' '||code===32;
    var isBack  = key==='Escape'||key==='Backspace'||key==='BrowserBack'||key==='GoBack'
                  ||code===27||code===8||code===461||code===10009||code===166||code===4
                  ||ec==='Escape'||ec==='BrowserBack';
    var isHome  = key==='Home'||code===36;
    var isEnd   = key==='End'||code===35;
    var isPageDown = key==='PageDown'||code===34;
    var isPageUp   = key==='PageUp'||code===33;

    var active = document.activeElement;
    var tag = active?active.tagName:'';
    var isEditable = (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(active&&active.isContentEditable));
    if(isEditable && !isEnter){
        if(isRight||isLeft||isUp||isDown) return;
    }

    var isRepeat = !!e.repeat;

    if(isRight){ e.preventDefault(); e.stopPropagation(); moveFocus('right', isRepeat); }
    else if(isLeft){ e.preventDefault(); e.stopPropagation(); moveFocus('left', isRepeat); }
    else if(isDown||isPageDown){ e.preventDefault(); e.stopPropagation(); moveFocus('down', isRepeat); }
    else if(isUp||isPageUp){ e.preventDefault(); e.stopPropagation(); moveFocus('up', isRepeat); }
    else if(isEnter){ e.preventDefault(); e.stopPropagation(); activateCurrent(); }
    else if(isBack){
        e.preventDefault(); e.stopPropagation();
        if(typeof window.FlashTV_BackHandler==='function') window.FlashTV_BackHandler();
    }
    else if(isHome){ e.preventDefault(); var i1=getVisibleItems(document,true); if(i1.length>0) setFocus(i1[0]); }
    else if(isEnd){ e.preventDefault(); var i2=getVisibleItems(document,true); if(i2.length>0) setFocus(i2[i2.length-1]); }
}
document.addEventListener('keydown', handleNavKey, { capture:true, passive:false });

/* ============ WebView Bridge (Android / Google TV APK) ============ */
window.addEventListener('message', function(e){
    if(e && e.data && e.data.type==='tv-key' && e.data.direction){
        handleNativeDirection(e.data.direction);
    }
}, false);

function handleNativeDirection(direction){
    if(direction==='enter'||direction==='select'||direction==='ok'){ activateCurrent(); return; }
    if(direction==='back'){
        if(typeof window.FlashTV_BackHandler==='function') window.FlashTV_BackHandler();
        return;
    }
    moveFocus(direction, false);
}

/* ============ الماوس ============ */
document.addEventListener('mouseover', function(e){
    var t = e.target;
    if(!t||!t.closest) return;
    var el = t.closest(FOCUSABLE);
    if(!el||el===currentEl) return;
    if(currentEl&&currentEl.classList) currentEl.classList.remove('tv-focus');
    currentEl = el;
    try{ el.classList.add('tv-focus'); }catch(e2){}
}, false);

/* ============ التركيز الابتدائي ============ */
function initialFocus(){
    setTimeout(function(){
        if(!currentEl){
            var items = getVisibleItems(document, true);
            if(items.length>0) setFocus(items[0]);
        }
    }, INITIAL_FOCUS_DELAY);
}
if(document.readyState==='complete') initialFocus();
else window.addEventListener('load', initialFocus);

/* ============ مراقبة DOM ============ */
if(window.MutationObserver){
    var _mt = null;
    var observer = new MutationObserver(function(){
        invalidateCache();
        if(currentEl && !document.body.contains(currentEl)){
            currentEl = null;
            clearTimeout(_mt);
            _mt = setTimeout(function(){
                var items = getVisibleItems(document, true);
                if(items.length>0) setFocus(items[0]);
            }, 180);
        }
    });
    observer.observe(document.body||document.documentElement, {
        childList:true, subtree:true, attributes:true,
        attributeFilter:['class','style','disabled']
    });
}

/* ============ resize ============ */
var _rz = null;
window.addEventListener('resize', function(){
    clearTimeout(_rz);
    _rz = setTimeout(function(){
        invalidateCache();
        if(currentEl && document.body.contains(currentEl)) setFocus(currentEl, true);
    }, 200);
});

window.addEventListener('scroll', function(){ invalidateCache(); }, { passive:true, capture:true });

/* ============ API ============ */
window.FlashTV_Nav = {
    focusFirst: function(){ var i=getVisibleItems(document,true); if(i.length>0) setFocus(i[0]); },
    focusElement: setFocus,
    move: moveFocus,
    activate: activateCurrent,
    refresh: invalidateCache,
    goToChannels: goFromCatToChannels,
    goToCategories: function(){ return goFromChannelsToCat(window.innerWidth<=768); },
    getCurrent: function(){ return currentEl; },
    handleNativeKey: handleNativeDirection
};

log('✅ FLASH TV Nav v3.2 loaded - FULL Android/Google TV support');

})();
