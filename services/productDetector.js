// This file contains the JavaScript that gets injected into the WebView
// to detect the main product image on PDP pages and inject a "Try On" button

export const PRODUCT_DETECTOR_JS = `
(function() {
  // Avoid re-injection
  if (window.__tryonInjected) return;
  window.__tryonInjected = true;

  var LOG_PREFIX = '[mrigAI]';

  function log(emoji, label, data) {
    var msg = emoji + ' ' + LOG_PREFIX + ' ' + label;
    if (data !== undefined) {
      console.log(msg, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } else {
      console.log(msg);
    }
  }

  log('💉', 'INJECTED — Product detector loaded on:', window.location.href);

  var TRYON_BTN_ID = '__tryon-floating-btn';
  var VIDEO_BTN_ID = '__tryon-video-btn';
  var TRYON_OVERLAY_ID = '__tryon-loading-overlay';
  var ZOOM_OVERLAY_ID = '__tryon-zoom-overlay';
  var DETECTED_ATTR = 'data-tryon-detected';
  var productImg = null; // Reference to the detected product image
  var originalProductSrc = null; // Original product image URL before replacement
  var __tryonBusy = false; // Guard against double-taps during generation
  var __tryonImageSrc = null; // The try-on result image URL for zoom

  // CSS for the floating Try On button + wave loading overlay
  var style = document.createElement('style');
  style.textContent =
    '#' + TRYON_BTN_ID + ' {' +
    '  position: fixed !important;' +
    '  bottom: 100px !important;' +
    '  left: 50% !important;' +
    '  transform: translateX(-50%) !important;' +
    '  background: #E8C8A0 !important;' +
    '  color: #0D0D0D !important;' +
    '  border: none !important;' +
    '  border-radius: 28px !important;' +
    '  padding: 14px 32px !important;' +
    '  font-size: 16px !important;' +
    '  font-weight: 700 !important;' +
    '  cursor: pointer !important;' +
    '  z-index: 2147483647 !important;' +
    '  box-shadow: 0 6px 24px rgba(232,200,160,0.4), 0 2px 8px rgba(0,0,0,0.3) !important;' +
    '  display: flex !important;' +
    '  align-items: center !important;' +
    '  justify-content: center !important;' +
    '  gap: 8px !important;' +
    '  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;' +
    '  transition: transform 0.2s ease, box-shadow 0.2s ease !important;' +
    '  line-height: 1 !important;' +
    '  letter-spacing: 0.5px !important;' +
    '  white-space: nowrap !important;' +
    '  animation: __tryon-slide-up 0.4s ease-out !important;' +
    '}' +
    '#' + TRYON_BTN_ID + ':active {' +
    '  transform: translateX(-50%) scale(0.95) !important;' +
    '  box-shadow: 0 3px 12px rgba(232,200,160,0.35), 0 1px 4px rgba(0,0,0,0.2) !important;' +
    '}' +
    '@keyframes __tryon-slide-up {' +
    '  from { transform: translateX(-50%) translateY(80px); opacity: 0; }' +
    '  to { transform: translateX(-50%) translateY(0); opacity: 1; }' +
    '}' +
    /* Container for icon buttons — bottom left */
    '.__tryon-btn-row {' +
    '  position: fixed !important;' +
    '  bottom: 100px !important;' +
    '  left: 16px !important;' +
    '  display: flex !important;' +
    '  flex-direction: row !important;' +
    '  gap: 10px !important;' +
    '  z-index: 2147483647 !important;' +
    '  animation: __tryon-fade-in 0.3s ease-out !important;' +
    '}' +
    '@keyframes __tryon-fade-in {' +
    '  from { opacity: 0; transform: translateY(10px); }' +
    '  to { opacity: 1; transform: translateY(0); }' +
    '}' +
    /* Icon-only circular buttons inside row */
    '.__tryon-btn-row #' + TRYON_BTN_ID + ' {' +
    '  position: static !important;' +
    '  bottom: auto !important;' +
    '  left: auto !important;' +
    '  transform: none !important;' +
    '  animation: none !important;' +
    '  width: auto !important;' +
    '  height: 52px !important;' +
    '  border-radius: 26px !important;' +
    '  padding: 0 16px !important;' +
    '  font-size: 15px !important;' +
    '}' +
    '.__tryon-btn-row #' + TRYON_BTN_ID + ':active {' +
    '  transform: scale(0.9) !important;' +
    '}' +
    '#' + VIDEO_BTN_ID + ' {' +
    '  width: auto !important;' +
    '  height: 52px !important;' +
    '  background: #1A1A1A !important;' +
    '  color: #E8C8A0 !important;' +
    '  border: 1.5px solid rgba(232,200,160,0.35) !important;' +
    '  border-radius: 26px !important;' +
    '  padding: 0 16px !important;' +
    '  font-size: 15px !important;' +
    '  font-weight: 700 !important;' +
    '  cursor: pointer !important;' +
    '  display: flex !important;' +
    '  align-items: center !important;' +
    '  justify-content: center !important;' +
    '  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;' +
    '  transition: transform 0.2s ease !important;' +
    '  line-height: 1 !important;' +
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.4) !important;' +
    '}' +
    '#' + VIDEO_BTN_ID + ':active {' +
    '  transform: scale(0.9) !important;' +
    '}' +
    /* Wave loading overlay styles */
    '#' + TRYON_OVERLAY_ID + ' {' +
    '  position: absolute !important;' +
    '  top: 0 !important;' +
    '  left: 0 !important;' +
    '  width: 100% !important;' +
    '  height: 100% !important;' +
    '  z-index: 2147483646 !important;' +
    '  display: flex !important;' +
    '  flex-direction: column !important;' +
    '  align-items: center !important;' +
    '  justify-content: center !important;' +
    '  background: rgba(13, 13, 13, 0.75) !important;' +
    '  overflow: hidden !important;' +
    '  border-radius: inherit !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-wave {' +
    '  position: absolute !important;' +
    '  top: 0 !important;' +
    '  left: 0 !important;' +
    '  width: 100% !important;' +
    '  height: 100% !important;' +
    '  background: linear-gradient(90deg, transparent 0%, rgba(232,200,160,0.15) 50%, transparent 100%) !important;' +
    '  animation: __tryon-wave-sweep 2s ease-in-out infinite !important;' +
    '}' +
    '@keyframes __tryon-wave-sweep {' +
    '  0% { transform: translateX(-100%); }' +
    '  100% { transform: translateX(100%); }' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-progress-wrap {' +
    '  position: relative !important;' +
    '  z-index: 2 !important;' +
    '  display: flex !important;' +
    '  flex-direction: column !important;' +
    '  align-items: center !important;' +
    '  gap: 12px !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-status-text {' +
    '  color: #E8C8A0 !important;' +
    '  font-size: 15px !important;' +
    '  font-weight: 700 !important;' +
    '  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;' +
    '  text-shadow: 0 1px 4px rgba(0,0,0,0.5) !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-progress-bar {' +
    '  width: 160px !important;' +
    '  height: 4px !important;' +
    '  border-radius: 2px !important;' +
    '  background: rgba(255,255,255,0.15) !important;' +
    '  overflow: hidden !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-progress-fill {' +
    '  width: 0%;' +
    '  height: 100% !important;' +
    '  border-radius: 2px !important;' +
    '  background: #E8C8A0 !important;' +
    '  transition: width 0.5s linear !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-percent {' +
    '  color: rgba(255,255,255,0.5) !important;' +
    '  font-size: 12px !important;' +
    '  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-countdown {' +
    '  color: rgba(255,255,255,0.35) !important;' +
    '  font-size: 11px !important;' +
    '  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;' +
    '  margin-top: -4px !important;' +
    '}' +
    /* Fullscreen zoom overlay */
    '#' + ZOOM_OVERLAY_ID + ' {' +
    '  position: fixed !important;' +
    '  top: 0 !important;' +
    '  left: 0 !important;' +
    '  width: 100vw !important;' +
    '  height: 100vh !important;' +
    '  z-index: 2147483647 !important;' +
    '  background: rgba(0,0,0,0.95) !important;' +
    '  display: flex !important;' +
    '  align-items: center !important;' +
    '  justify-content: center !important;' +
    '  overflow: auto !important;' +
    '  -webkit-overflow-scrolling: touch !important;' +
    '}' +
    '#' + ZOOM_OVERLAY_ID + ' img {' +
    '  max-width: none !important;' +
    '  max-height: none !important;' +
    '  width: 100vw !important;' +
    '  height: auto !important;' +
    '  object-fit: contain !important;' +
    '  touch-action: pinch-zoom !important;' +
    '}' +
    '#' + ZOOM_OVERLAY_ID + ' .__tryon-zoom-close {' +
    '  position: fixed !important;' +
    '  top: 16px !important;' +
    '  right: 16px !important;' +
    '  width: 40px !important;' +
    '  height: 40px !important;' +
    '  border-radius: 20px !important;' +
    '  background: rgba(255,255,255,0.15) !important;' +
    '  border: none !important;' +
    '  color: #fff !important;' +
    '  font-size: 20px !important;' +
    '  display: flex !important;' +
    '  align-items: center !important;' +
    '  justify-content: center !important;' +
    '  cursor: pointer !important;' +
    '  z-index: 2147483647 !important;' +
    '}';
  document.head.appendChild(style);

  log('🎨', 'STYLES — Injected floating button + wave overlay CSS');

  var progressInterval = null;
  var quipTimerGlobal = null;

  var __tryonDuration = 20000; // default for V2 (Nano Banana 2)

  function showLoadingOverlay(mode) {
    mode = mode || 'tryon';

    // Remove existing overlay
    removeLoadingOverlay();

    var parent = null;
    var validImg = getValidProductImg();
    if (validImg) {
      // Make the image container position:relative for overlay positioning
      parent = validImg.parentElement;
      if (parent) {
        var parentPos = window.getComputedStyle(parent).position;
        if (parentPos === 'static') {
          parent.style.position = 'relative';
        }
      }
    }

    // If no product image or parent, use fixed full-screen overlay as fallback
    var useFixed = !parent;

    // Create overlay
    var overlay = document.createElement('div');
    overlay.id = TRYON_OVERLAY_ID;
    if (useFixed) {
      overlay.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;background:rgba(13,13,13,0.75)!important;overflow:hidden!important;';
    }

    // Wave sweep element
    var wave = document.createElement('div');
    wave.className = '__tryon-wave';
    overlay.appendChild(wave);

    // Progress content
    var progressWrap = document.createElement('div');
    progressWrap.className = '__tryon-progress-wrap';

    var statusText = document.createElement('div');
    statusText.className = '__tryon-status-text';
    var initQuips = mode === 'video'
      ? ['AI directing ur thirst trap...', 'lights camera slay...', 'plotting ur viral moment...']
      : ['mentally undressing you...', 'checking you out... for science...', 'the AI said wow btw...'];
    statusText.textContent = initQuips[Math.floor(Math.random() * initQuips.length)];
    progressWrap.appendChild(statusText);

    var progressBar = document.createElement('div');
    progressBar.className = '__tryon-progress-bar';

    var progressFill = document.createElement('div');
    progressFill.className = '__tryon-progress-fill';
    progressBar.appendChild(progressFill);
    progressWrap.appendChild(progressBar);

    var percentText = document.createElement('div');
    percentText.className = '__tryon-percent';
    percentText.textContent = '0%';
    progressWrap.appendChild(percentText);

    var countdownText = document.createElement('div');
    countdownText.className = '__tryon-countdown';
    var countdownTotal = mode === 'video' ? 60 : Math.round(__tryonDuration / 1000);
    countdownText.textContent = '~' + countdownTotal + 's';
    progressWrap.appendChild(countdownText);

    overlay.appendChild(progressWrap);

    // Insert overlay into the image's parent, or body as fallback
    if (parent) {
      parent.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }

    log('🌊', 'OVERLAY — Wave loading overlay shown' + (useFixed ? ' (fixed fallback)' : ' on product image'));

    // Remove all buttons during loading
    var btn = document.getElementById(TRYON_BTN_ID);
    if (btn) btn.remove();
    var btnRow = document.querySelector('.' + BTN_ROW_CLASS);
    if (btnRow) btnRow.remove();

    // Animate progress — reads __tryonDuration live so it can be updated mid-flight
    var startTime = Date.now();
    var isVideo = mode === 'video';
    // Fun quirky loading messages — cycle fast regardless of progress speed
    var tryonQuips = [
      'mentally undressing you...',
      'its giving main character...',
      'okay u kinda ate that...',
      'checking you out... for science...',
      'not me blushing at pixels...',
      'ur outfit has trust issues...',
      'stripping... the old clothes off...',
      'the AI said wow btw...',
      'fitting room but make it AI...',
      'this is fashion not a crime...',
      'wardrobe malfunction loading...',
      'drip check in progress...',
      'styling you like my crush...',
      'be honest u look expensive...',
      'AI went feral for this one...',
      'the fit is fitting...',
      'gaslight gatekeep slay...',
      'ur giving old money vibes...',
      'alexa play sexy back...',
      'mirror mirror on the wall...',
      'no thoughts just drip...',
      'ur card declined but u still ate...',
      'downloading rizz...',
      'AI caught feelings ngl...',
      'objectifying you respectfully...',
      'hold my pixels...',
      'ur body said yes already...',
      'this is legal i promise...',
      'the mannequin is shaking rn...',
      'couture but make it unhinged...',
      'outfit so fire calling 911...',
      'dressing u up like my sim...',
      'the algorithm has a crush...',
      'serving cunt honestly...',
      'ur closet could never...',
      'AI is down bad for u...',
      'virtual sugar daddy energy...',
      'ctrl+z ur old outfit...',
      'fashion emergency dispatched...',
      'swipe right on this fit...',
      'hotter than ur ex ngl...',
      'ur stylist called. its me...',
      'deleting ur old wardrobe...',
      'the vibe check cleared...',
      'giving renaissance era slay...',
      'fabric physics go brr...',
      'the AI needs a cold shower...',
      'zara who? u ARE the brand...',
      'god tier fit incoming...',
      'ur reflection just gasped...',
      'adding drip... please wait...',
      'confidence.exe loading...',
      'the cloth consented dw...',
      'stitching pixels with love...',
      'ur mom would be proud ngl...',
      'the fit is about to slap...',
      'breaking fashion laws rn...',
      'outfit reveal in 3 2 1...',
      'AI is sweating... respectfully...',
      'this is art and ur the canvas...',
      'certified hot person activity...',
      'ur outfit just got evicted...',
      'new drip who dis...',
      'the try-on of the century...',
      'processing hotness levels...',
      'AI having a fashion orgasm...',
      'upgrade in progress bestie...',
      'the algorithm is blushing...',
      'runway ready in seconds...',
      'making mannequins unemployed...',
    ];
    var videoQuips = [
      'AI directing ur thirst trap...',
      'rendering the serve...',
      'plotting ur viral moment...',
      'lights camera slay...',
      'serving face serving body...',
      'vogue called they want u...',
      'motion capture but sexy...',
      'making pixels jealous rn...',
      'this reel will break hearts...',
      'ur walk just ended careers...',
      'giving fashion week energy...',
      'the camera is obsessed w u...',
      'frame by frame of pure slay...',
      'recording evidence of a serve...',
      'ur video has no skip button...',
      'the AI is ur hype man now...',
      'walk like rent is due...',
      'tiktok isnt ready for this...',
      'rendering ur glow up...',
      'the camera adds 10 rizz...',
      'oscar for best thirst trap...',
      'slow mo slay activated...',
      'ur video just cleared security...',
      'spinning the slay reel...',
      'more frames more fame...',
      'instagram is shaking rn...',
      'editing out the mid parts...',
      'the video screamed slay...',
      'capturing main character aura...',
      'blockbuster vibes only...',
      'viral speedrun any% ...',
      'rendering ur runway walk...',
      'this vid will do numbers...',
      'cinematic universe: u...',
      'buffering ur icon moment...',
    ];
    // Shuffle array so no quip repeats until all have been shown
    function shuffle(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }
    var activeQuips = isVideo ? videoQuips : tryonQuips;
    var shuffled = shuffle(activeQuips);
    var quipIndex = 0;
    // Cycle quips on a fast fixed timer (every 2s) — no repeats in a single generation
    if (quipTimerGlobal) clearInterval(quipTimerGlobal);
    quipTimerGlobal = setInterval(function() {
      statusText.textContent = shuffled[quipIndex];
      quipIndex++;
      if (quipIndex >= shuffled.length) {
        shuffled = shuffle(activeQuips);
        quipIndex = 0;
      }
    }, 2000);

    var lastPct = 0;
    progressInterval = setInterval(function() {
      var elapsed = Date.now() - startTime;
      var activeDuration = isVideo ? 120000 : __tryonDuration;
      var pct = Math.min(95, Math.round((elapsed / activeDuration) * 100));

      // Never go backward — if duration was updated mid-flight, just slow down from current position
      if (pct < lastPct) pct = lastPct;
      lastPct = pct;

      progressFill.style.width = pct + '%';
      percentText.textContent = pct + '%';

      var countdownDuration = isVideo ? 60000 : activeDuration;
      var remaining = Math.max(0, Math.round((countdownDuration - elapsed) / 1000));
      countdownText.textContent = remaining > 0 ? '~' + remaining + 's' : 'almost done...';

      if (pct >= 95) {
        clearInterval(progressInterval);
        progressInterval = null;
        clearInterval(quipTimerGlobal);
        quipTimerGlobal = null;
      }
    }, 500);
  }

  function removeLoadingOverlay() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    if (quipTimerGlobal) {
      clearInterval(quipTimerGlobal);
      quipTimerGlobal = null;
    }
    var existing = document.getElementById(TRYON_OVERLAY_ID);
    if (existing) {
      existing.remove();
      log('🧹', 'OVERLAY — Loading overlay removed');
    }
  }

  function openZoomOverlay() {
    if (!__tryonImageSrc) return;
    var existing = document.getElementById(ZOOM_OVERLAY_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = ZOOM_OVERLAY_ID;

    var img = document.createElement('img');
    img.src = __tryonImageSrc;

    var closeBtn = document.createElement('button');
    closeBtn.className = '__tryon-zoom-close';
    closeBtn.innerHTML = '\\u{2715}';
    closeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      overlay.remove();
    });

    // Tap on background (not on image) to close
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
    log('🔍', 'ZOOM — Opened fullscreen zoom overlay');
  }

  function makeImageTappable() {
    if (!productImg || !__tryonImageSrc) return;
    productImg.style.cursor = 'zoom-in';
    productImg.__tryonTapHandler = function(e) {
      e.preventDefault();
      e.stopPropagation();
      openZoomOverlay();
    };
    productImg.addEventListener('click', productImg.__tryonTapHandler);
  }

  function removeImageTapHandler() {
    if (productImg && productImg.__tryonTapHandler) {
      productImg.removeEventListener('click', productImg.__tryonTapHandler);
      productImg.__tryonTapHandler = null;
      productImg.style.cursor = '';
    }
  }

  // Re-validate productImg before critical operations (overlay placement, image replacement).
  // If the site swapped the DOM node (carousel, lazy-load, SPA re-render), re-detect it.
  function getValidProductImg() {
    // Still attached and visible? Keep it.
    if (productImg && productImg.isConnected && productImg.getBoundingClientRect().height > 0) {
      return productImg;
    }

    log('⚠️', 'REDETECT — productImg stale/detached, attempting re-detection');

    // Clear marker so re-scan can find the same image again
    if (productImg) productImg.removeAttribute(DETECTED_ATTR);
    productImg = null;

    // Try to find by original URL first (most reliable re-match)
    if (originalProductSrc) {
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var src = imgs[i].currentSrc || imgs[i].src;
        if (src === originalProductSrc && imgs[i].getBoundingClientRect().height > 0) {
          log('✅', 'REDETECT — Found by URL match');
          productImg = imgs[i];
          productImg.setAttribute(DETECTED_ATTR, 'true');
          return productImg;
        }
      }
    }

    // URL match failed — fall back to size-based detection
    var img = findProductImage();
    if (img) {
      log('✅', 'REDETECT — Found by size-based scan');
      img.setAttribute(DETECTED_ATTR, 'true');
      productImg = img;
      originalProductSrc = originalProductSrc || img.currentSrc || img.src;
    } else {
      log('❌', 'REDETECT — Failed, no valid product image found');
    }
    return productImg;
  }

  function findProductImage() {
    var screenW = window.innerWidth;
    var threshold = screenW * 0.75;
    var minHeight = 200;

    log('🔍', 'SCANNING — Screen width: ' + screenW + 'px, threshold: ' + Math.round(threshold) + 'px, minHeight: ' + minHeight + 'px');

    var images = document.querySelectorAll('img:not([' + DETECTED_ATTR + '])');
    log('🔍', 'SCANNING — Found ' + images.length + ' unprocessed img tags');

    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var rect = img.getBoundingClientRect();

      // Skip images not in viewport vertically (too far below)
      if (rect.top > window.innerHeight * 3) continue;

      // Skip hidden images
      if (rect.width === 0 || rect.height === 0) continue;

      // Size check
      if (rect.width < threshold || rect.height < minHeight) continue;

      log('📐', 'CHECKING — img[' + i + '] size: ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + 'px, src: ' + (img.currentSrc || img.src || ''));

      // Visibility check: is this image actually the topmost element at its center?
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var topEl = document.elementFromPoint(centerX, centerY);
      var isVisible = (topEl === img) || (topEl !== null && topEl.tagName !== 'IMG');

      log('👁️', 'VISIBILITY — img[' + i + '] isVisible: ' + isVisible + ', topEl: ' + (topEl ? topEl.tagName + '.' + (topEl.className || '').substring(0, 30) : 'null'));

      if (isVisible) {
        log('✅', 'MATCH — Found visible product image! ' + Math.round(rect.width) + 'x' + Math.round(rect.height) + 'px');
        return img;
      }
    }

    log('❌', 'NO MATCH — No visible full-width product image found on this page');
    return null;
  }

  var BTN_ROW_CLASS = '__tryon-btn-row';

  function removeBtnRow() {
    var rows = document.querySelectorAll('.' + BTN_ROW_CLASS);
    rows.forEach(function(r) { r.remove(); });
    var standalone = document.getElementById(TRYON_BTN_ID);
    if (standalone) standalone.remove();
    var videoBtn = document.getElementById(VIDEO_BTN_ID);
    if (videoBtn) videoBtn.remove();
  }

  function injectTryOnButton(img) {
    if (img.getAttribute(DETECTED_ATTR)) return;
    img.setAttribute(DETECTED_ATTR, 'true');
    productImg = img;
    originalProductSrc = img.currentSrc || img.src || img.dataset.src;

    // Remove existing buttons
    removeBtnRow();

    // Create floating button fixed to bottom of screen
    var btn = document.createElement('button');
    btn.id = TRYON_BTN_ID;
    btn.innerHTML = '\\u{1F455} Try This On';

    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (__tryonBusy) return;
      __tryonBusy = true;
      btn.remove();

      var imgSrc = img.currentSrc || img.src || img.dataset.src;

      log('👆', 'BUTTON CLICKED — Sending try-on request');
      log('🖼️', 'IMAGE URL —', imgSrc);

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tryon_request',
        imageUrl: imgSrc,
        pageUrl: window.location.href,
      }));
    });

    document.body.appendChild(btn);
    log('🔘', 'BUTTON — Floating Try On button added to page');

    // Notify RN that a product was detected on this page (for persistent try-on check)
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'product_detected',
      pageUrl: window.location.href,
    }));
    log('📤', 'NOTIFY — Sent product_detected to React Native');
  }

  function showButtonRow(showVideo, tryLabel) {
    // Remove existing buttons first
    removeBtnRow();

    // Create a row container
    var row = document.createElement('div');
    row.className = BTN_ROW_CLASS;

    // Re-create Try On button (CSS overrides fixed positioning when inside row)
    var tryBtn = document.createElement('button');
    tryBtn.id = TRYON_BTN_ID;
    tryBtn.innerHTML = tryLabel || '\\u{1F455}';

    tryBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!productImg || __tryonBusy) return;
      __tryonBusy = true;
      row.remove();
      // Always use the original product image URL (not the replaced try-on base64)
      var imgSrc = originalProductSrc || productImg.currentSrc || productImg.src || productImg.dataset.src;
      var isRetry = !!originalProductSrc && productImg.src !== originalProductSrc;
      log('👆', 'BUTTON CLICKED — Sending try-on request' + (isRetry ? ' (RETRY)' : ''));
      log('🖼️', 'IMAGE URL —', imgSrc);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tryon_request',
        imageUrl: imgSrc,
        pageUrl: window.location.href,
        retry: isRetry,
      }));
    });

    row.appendChild(tryBtn);

    if (showVideo) {
      var vidBtn = document.createElement('button');
      vidBtn.id = VIDEO_BTN_ID;
      vidBtn.innerHTML = '\\u{1F3AC} Video';
      vidBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (__tryonBusy) return;
        __tryonBusy = true;
        row.remove();
        log('🎬', 'VIDEO BUTTON CLICKED — Sending video request');
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'video_request',
        }));
      });
      row.appendChild(vidBtn);
    }

    document.body.appendChild(row);
    log('🔘', 'BUTTON ROW — Shown with' + (showVideo ? ' Video button' : 'out Video button'));
  }

  function replaceProductImage(imageSource) {
    // Re-validate productImg — site may have swapped the DOM node during generation
    var validImg = getValidProductImg();
    if (!validImg) {
      log('❌', 'REPLACE — No product image found even after re-detection!');
      removeLoadingOverlay();
      return;
    }

    log('🔄', 'REPLACE — Replacing product image with try-on result');

    // Nuke srcset and sizes so browser cant override our src
    validImg.removeAttribute('srcset');
    validImg.removeAttribute('sizes');
    log('🧹', 'REPLACE — Removed srcset and sizes attributes');

    // If inside a <picture>, remove all <source> tags
    var picture = validImg.closest('picture');
    if (picture) {
      var sources = picture.querySelectorAll('source');
      sources.forEach(function(s) { s.remove(); });
      log('🧹', 'REPLACE — Removed ' + sources.length + ' <source> tags from <picture>');
    }

    // Remove old tap handler before replacing
    removeImageTapHandler();

    // For CDN URLs, preload the image before swapping to avoid flash of old image
    if (imageSource.startsWith('http')) {
      var preload = new Image();
      preload.onload = function() {
        validImg.src = imageSource;
        __tryonImageSrc = imageSource;
        log('✅', 'REPLACE — Product image replaced with CDN URL (preloaded)');
        removeLoadingOverlay();
        makeImageTappable();
        showButtonRow(true, '\\u{21BB} Retry');
      };
      preload.onerror = function() {
        validImg.src = imageSource;
        __tryonImageSrc = imageSource;
        log('⚠️', 'REPLACE — CDN preload failed, set src directly');
        removeLoadingOverlay();
        makeImageTappable();
        showButtonRow(true, '\\u{21BB} Retry');
      };
      preload.src = imageSource;
    } else {
      validImg.src = 'data:image/png;base64,' + imageSource;
      __tryonImageSrc = validImg.src;
      log('✅', 'REPLACE — Product image replaced with base64 (length: ' + imageSource.length + ')');
      removeLoadingOverlay();
      makeImageTappable();
      showButtonRow(true, '\\u{21BB} Retry');
    }
  }

  // Expose key functions globally so RN can call directly via injectJavaScript
  // This avoids postMessage JSON serialization overhead for large base64 payloads (3MB+)
  window.__tryonReplaceImage = function(src) {
    log('📨', 'DIRECT CALL — __tryonReplaceImage (base64 len=' + (src ? src.length : 0) + ')');
    __tryonBusy = false;
    replaceProductImage(src);
  };
  window.__tryonShowLoading = function() { __tryonBusy = true; showLoadingOverlay(); };
  window.__tryonSetDuration = function(d) { __tryonDuration = d; };

  // Listen for messages from React Native (loading, result, error)
  window.addEventListener('message', function(event) {
    try {
      var data = JSON.parse(event.data);
      if (data.type === 'tryon_loading') {
        __tryonBusy = true;
        if (data.duration) __tryonDuration = data.duration;
        // Close zoom overlay and remove tap handler if open
        var zoomEl = document.getElementById(ZOOM_OVERLAY_ID);
        if (zoomEl) zoomEl.remove();
        removeImageTapHandler();
        __tryonImageSrc = null;
        log('📨', 'RN MESSAGE — Try-on loading started (duration: ' + __tryonDuration + 'ms)');
        showLoadingOverlay();
      } else if (data.type === 'tryon_duration' && data.duration) {
        // Update duration mid-flight after detection completes
        __tryonDuration = data.duration;
        log('📨', 'RN MESSAGE — Duration updated to ' + __tryonDuration + 'ms');
      } else if (data.type === 'tryon_result' && (data.imageUrl || data.base64)) {
        __tryonBusy = false;
        var imgSrc = data.imageUrl || data.base64;
        log('📨', 'RN MESSAGE — Try-on result received (' + (data.imageUrl ? 'CDN URL' : 'base64') + ')');
        replaceProductImage(imgSrc);
      } else if (data.type === 'previous_tryon' && data.imageUrl) {
        // Inject previous try-on from cloud (persistent try-ons)
        log('📨', 'RN MESSAGE — Previous try-on found for this product');
        replaceProductImage(data.imageUrl);
      } else if (data.type === 'tryon_no_retry') {
        // Non-retryable error (e.g. selfie missing) — clean up, no retry button
        __tryonBusy = false;
        log('📨', 'RN MESSAGE — Non-retryable error: ' + (data.errorText || ''));
        if (quipTimerGlobal) { clearInterval(quipTimerGlobal); quipTimerGlobal = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        var nrOverlay = document.getElementById(TRYON_OVERLAY_ID);
        if (nrOverlay) {
          var nrStatus = nrOverlay.querySelector('.__tryon-status-text');
          if (nrStatus) nrStatus.textContent = data.errorText || 'something went wrong';
          var nrProgress = nrOverlay.querySelector('.__tryon-progress-fill');
          if (nrProgress) nrProgress.style.background = '#ef4444';
        }
        setTimeout(function() {
          removeLoadingOverlay();
        }, 2000);
      } else if (data.type === 'tryon_error') {
        __tryonBusy = false;
        log('📨', 'RN MESSAGE — Try-on generation failed');
        // Flash error text on overlay before removing
        var overlay = document.getElementById(TRYON_OVERLAY_ID);
        if (overlay) {
          var statusEl = overlay.querySelector('.__tryon-status-text');
          if (statusEl) statusEl.textContent = data.errorText || 'oof, that failed';
          var progressEl = overlay.querySelector('.__tryon-progress-fill');
          if (progressEl) progressEl.style.background = '#ef4444';
        }
        // Clear timers immediately
        if (quipTimerGlobal) { clearInterval(quipTimerGlobal); quipTimerGlobal = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        // Remove overlay after brief flash, then show retry
        setTimeout(function() {
          removeLoadingOverlay();
          showButtonRow(false, '\\u{21BB} Retry');
        }, 1500);
      } else if (data.type === 'video_loading') {
        __tryonBusy = true;
        log('📨', 'RN MESSAGE — Video generation started');
        // Hide buttons during video generation
        removeBtnRow();
        showLoadingOverlay('video');
      } else if (data.type === 'video_done') {
        __tryonBusy = false;
        log('📨', 'RN MESSAGE — Video generation complete');
        removeLoadingOverlay();
        showButtonRow(true, '\\u{21BB} Retry');
      } else if (data.type === 'video_error') {
        __tryonBusy = false;
        log('📨', 'RN MESSAGE — Video generation failed');
        var overlay = document.getElementById(TRYON_OVERLAY_ID);
        if (overlay) {
          var statusEl = overlay.querySelector('.__tryon-status-text');
          if (statusEl) statusEl.textContent = data.errorText || 'video flopped, retry?';
          var progressEl = overlay.querySelector('.__tryon-progress-fill');
          if (progressEl) progressEl.style.background = '#ef4444';
        }
        if (quipTimerGlobal) { clearInterval(quipTimerGlobal); quipTimerGlobal = null; }
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
        setTimeout(function() {
          removeLoadingOverlay();
          showButtonRow(true, '\\u{21BB} Retry');
        }, 1500);
      }
    } catch(e) {
      // Ignore non-JSON messages
    }
  });

  var lastKnownUrl = window.location.href;
  var resetTimer = null;

  function resetDetectorState() {
    log('🔄', 'RESET — Clearing detector state for new page');

    // Remove old buttons and overlay
    removeBtnRow();
    removeLoadingOverlay();

    // Reset busy flag so new page can trigger try-ons
    __tryonBusy = false;
    originalProductSrc = null;

    // Clear detected attribute from old image
    if (productImg) {
      productImg.removeAttribute(DETECTED_ATTR);
    }
    productImg = null;

    // Re-scan after the new page content settles
    setTimeout(scanForProduct, 300);
    log('⏱️', 'RESET — Scheduled re-scan in 300ms for new page');
  }

  function checkUrlChange() {
    var currentUrl = window.location.href;
    // Only compare the path portion, ignore query string / hash changes from analytics
    var currentPath = window.location.pathname;
    var lastPath = '';
    try { lastPath = new URL(lastKnownUrl).pathname; } catch(e) { lastPath = lastKnownUrl; }

    if (currentPath !== lastPath) {
      log('🔀', 'SPA NAV — Path changed from: ' + lastPath);
      log('🔀', 'SPA NAV — Path changed to:   ' + currentPath);
      lastKnownUrl = currentUrl;

      // Debounce: some SPAs fire multiple pushState calls during a single navigation
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(function() {
        resetTimer = null;
        resetDetectorState();
      }, 300);
    } else {
      // Update the full URL even if only query/hash changed
      lastKnownUrl = currentUrl;
    }
  }

  // PLAT-5: Listen for __tryon_nav events (fired by WebView's pushState/replaceState patches)
  // instead of double-patching history.pushState/replaceState
  window.addEventListener('__tryon_nav', function() {
    setTimeout(checkUrlChange, 50);
  });

  log('🔀', 'SPA NAV — Listening for __tryon_nav events from WebView patches');

  function scanForProduct(trigger) {
    // Only inject once per page — find the first full-width product image
    if (productImg) return;

    var img = findProductImage();
    if (img) {
      log('✅', 'SCAN — Detected via ' + (trigger || 'unknown'));
      injectTryOnButton(img);
      stopDetection();
    }
  }

  // --- Hybrid detection: polling (reliable) + MutationObserver (fast) ---

  var pollTimer = null;
  var pollStart = Date.now();

  function pollTick() {
    if (productImg) return;
    scanForProduct('poll');
    if (productImg) return; // found during scan

    // Back off: 150ms for first 3s, 500ms for next 5s, 2s after, stop at 30s
    var elapsed = Date.now() - pollStart;
    var next;
    if (elapsed < 3000) next = 150;
    else if (elapsed < 8000) next = 500;
    else if (elapsed < 30000) next = 2000;
    else return; // stop polling after 30s

    pollTimer = setTimeout(pollTick, next);
  }

  // MutationObserver — interrupt between poll ticks for faster detection
  var mutationDebounce = null;
  var observer = new MutationObserver(function(mutations) {
    if (productImg) return;
    var hasNewNodes = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(function() {
        scanForProduct('mutation');
      }, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Scroll listener — catches scroll-triggered lazy loads
  var scrollTimer;
  window.addEventListener('scroll', function() {
    if (productImg) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function() {
      scanForProduct('scroll');
    }, 200);
  }, { passive: true });

  function stopDetection() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (mutationDebounce) { clearTimeout(mutationDebounce); mutationDebounce = null; }
    if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
    observer.disconnect();
  }

  // Kick off: scan immediately, then start polling
  scanForProduct('immediate');
  if (!productImg) pollTick();

  log('👀', 'OBSERVERS — Polling + MutationObserver + scroll active');

  // Notify RN that injection is complete
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'injection_complete',
    url: window.location.href,
  }));

  log('📤', 'READY — Injection complete, notified React Native');
})();
`;
