// This file contains the JavaScript that gets injected into the WebView
// to detect the main product image on PDP pages and inject a "Try On" button

export const PRODUCT_DETECTOR_JS = `
(function() {
  // Avoid re-injection
  if (window.__tryonInjected) return;
  window.__tryonInjected = true;

  var LOG_PREFIX = '[TryOnAI]';

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
  var DETECTED_ATTR = 'data-tryon-detected';
  var productImg = null; // Reference to the detected product image
  var originalProductSrc = null; // Original product image URL before replacement
  var __tryonBusy = false; // Guard against double-taps during generation

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
    '  width: 52px !important;' +
    '  height: 52px !important;' +
    '  border-radius: 26px !important;' +
    '  padding: 0 !important;' +
    '  font-size: 22px !important;' +
    '}' +
    '.__tryon-btn-row #' + TRYON_BTN_ID + ':active {' +
    '  transform: scale(0.9) !important;' +
    '}' +
    '#' + VIDEO_BTN_ID + ' {' +
    '  width: 52px !important;' +
    '  height: 52px !important;' +
    '  background: #1A1A1A !important;' +
    '  color: #E8C8A0 !important;' +
    '  border: 1.5px solid rgba(232,200,160,0.35) !important;' +
    '  border-radius: 26px !important;' +
    '  padding: 0 !important;' +
    '  font-size: 22px !important;' +
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
    '  width: 0% !important;' +
    '  height: 100% !important;' +
    '  border-radius: 2px !important;' +
    '  background: #E8C8A0 !important;' +
    '  transition: width 0.5s linear !important;' +
    '}' +
    '#' + TRYON_OVERLAY_ID + ' .__tryon-percent {' +
    '  color: rgba(255,255,255,0.5) !important;' +
    '  font-size: 12px !important;' +
    '  font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;' +
    '}';
  document.head.appendChild(style);

  log('🎨', 'STYLES — Injected floating button + wave overlay CSS');

  var progressInterval = null;
  var quipTimerGlobal = null;

  var __tryonDuration = 12000; // default for Flash, overridden by message

  function showLoadingOverlay(mode) {
    mode = mode || 'tryon';

    // Remove existing overlay
    removeLoadingOverlay();

    var parent = null;
    if (productImg) {
      // Make the image container position:relative for overlay positioning
      parent = productImg.parentElement;
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

    progressInterval = setInterval(function() {
      var elapsed = Date.now() - startTime;
      var activeDuration = isVideo ? 60000 : __tryonDuration;
      var pct = Math.min(95, Math.round((elapsed / activeDuration) * 100));

      progressFill.style.width = pct + '%';
      percentText.textContent = pct + '%';

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

  function getProductInfo() {
    var info = { name: '', price: '' };

    // Product name: check page-level elements (we are on PDP)
    var titleEl = document.querySelector(
      'h1, ' +
      '[class*="product-title"], [class*="product-name"], [class*="productTitle"], ' +
      '[class*="pdp-title"], [class*="product-brand"], ' +
      '[data-testid*="title"], [data-testid*="name"]'
    );
    if (titleEl) {
      info.name = titleEl.innerText.trim().substring(0, 120);
    }
    if (!info.name) {
      // Fallback: try h2, h3
      var headings = document.querySelectorAll('h2, h3');
      for (var i = 0; i < headings.length; i++) {
        var t = headings[i].innerText.trim();
        if (t.length > 3 && t.length < 120) {
          info.name = t;
          break;
        }
      }
    }

    // Price
    var pageText = document.body.innerText || '';
    var priceMatch = pageText.match(/[\\u20B9$\\u20AC\\u00A3]\\s*[\\d,]+\\.?\\d*/);
    if (priceMatch) info.price = priceMatch[0];

    log('📝', 'PRODUCT INFO — Extracted:', info);
    return info;
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
      var isTopmost = (topEl === img);

      log('👁️', 'VISIBILITY — img[' + i + '] isTopmost: ' + isTopmost + ', topEl: ' + (topEl ? topEl.tagName + '.' + (topEl.className || '').substring(0, 30) : 'null'));

      if (isTopmost) {
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
      var info = getProductInfo();

      log('👆', 'BUTTON CLICKED — Sending try-on request');
      log('🖼️', 'IMAGE URL —', imgSrc);
      log('📦', 'PRODUCT —', info);

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tryon_request',
        imageUrl: imgSrc,
        productName: info.name || 'Product',
        productPrice: info.price,
        pageUrl: window.location.href,
      }));
    });

    document.body.appendChild(btn);
    log('🔘', 'BUTTON — Floating Try On button added to page');
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
      var info = getProductInfo();
      var isRetry = !!originalProductSrc && (productImg.src || '').indexOf('data:image') === 0;
      log('👆', 'BUTTON CLICKED — Sending try-on request' + (isRetry ? ' (RETRY)' : ''));
      log('🖼️', 'IMAGE URL —', imgSrc);
      log('📦', 'PRODUCT —', info);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'tryon_request',
        imageUrl: imgSrc,
        productName: info.name || 'Product',
        productPrice: info.price,
        pageUrl: window.location.href,
        retry: isRetry,
      }));
    });

    row.appendChild(tryBtn);

    if (showVideo) {
      var vidBtn = document.createElement('button');
      vidBtn.id = VIDEO_BTN_ID;
      vidBtn.innerHTML = '\\u{1F3AC}';
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

  function replaceProductImage(base64Data) {
    // Remove loading overlay first
    removeLoadingOverlay();

    if (!productImg) {
      log('❌', 'REPLACE — No product image reference found!');
      return;
    }

    log('🔄', 'REPLACE — Replacing product image with try-on result');

    // Nuke srcset and sizes so browser cant override our src
    productImg.removeAttribute('srcset');
    productImg.removeAttribute('sizes');
    log('🧹', 'REPLACE — Removed srcset and sizes attributes');

    // If inside a <picture>, remove all <source> tags
    var picture = productImg.closest('picture');
    if (picture) {
      var sources = picture.querySelectorAll('source');
      sources.forEach(function(s) { s.remove(); });
      log('🧹', 'REPLACE — Removed ' + sources.length + ' <source> tags from <picture>');
    }

    // Set the try-on result as img src
    productImg.src = 'data:image/png;base64,' + base64Data;
    log('✅', 'REPLACE — Product image replaced successfully! (base64 length: ' + base64Data.length + ')');

    // Show button row with Video button — ↻ icon for retry
    showButtonRow(true, '\\u{21BB}');
  }

  // Listen for messages from React Native (loading, result, error)
  window.addEventListener('message', function(event) {
    try {
      var data = JSON.parse(event.data);
      if (data.type === 'tryon_loading') {
        __tryonBusy = true;
        if (data.duration) __tryonDuration = data.duration;
        log('📨', 'RN MESSAGE — Try-on loading started (duration: ' + __tryonDuration + 'ms)');
        showLoadingOverlay();
      } else if (data.type === 'tryon_duration' && data.duration) {
        // Update duration mid-flight after detection completes
        __tryonDuration = data.duration;
        log('📨', 'RN MESSAGE — Duration updated to ' + __tryonDuration + 'ms');
      } else if (data.type === 'tryon_result' && data.base64) {
        __tryonBusy = false;
        log('📨', 'RN MESSAGE — Try-on result received (base64 length: ' + data.base64.length + ')');
        replaceProductImage(data.base64);
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
          showButtonRow(false, '\\u{21BB}');
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
        showButtonRow(true, '\\u{21BB}');
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
          showButtonRow(true, '\\u{21BB}');
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

    // Clear detected attribute from old image
    if (productImg) {
      productImg.removeAttribute(DETECTED_ATTR);
    }
    productImg = null;

    // Re-scan after the new page content settles
    setTimeout(scanForProduct, 1500);
    log('⏱️', 'RESET — Scheduled re-scan in 1.5s for new page');
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

  // Monkey-patch pushState and replaceState for SPA navigation detection
  var origPushState = history.pushState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    setTimeout(checkUrlChange, 50);
  };

  var origReplaceState = history.replaceState;
  history.replaceState = function() {
    origReplaceState.apply(this, arguments);
    setTimeout(checkUrlChange, 50);
  };

  window.addEventListener('popstate', function() {
    setTimeout(checkUrlChange, 50);
  });

  log('🔀', 'SPA NAV — History API hooks installed for SPA navigation detection');

  function scanForProduct() {
    // Only inject once per page — find the first full-width product image
    if (productImg) {
      log('⏭️', 'SCAN — Already detected a product image, skipping');
      return;
    }

    var img = findProductImage();
    if (img) {
      injectTryOnButton(img);
    }
  }

  // Initial scan after page settles
  setTimeout(scanForProduct, 1500);
  log('⏱️', 'SCAN — Scheduled initial scan in 1.5s');

  // Re-scan on scroll (debounced) for lazy-loaded hero images
  var scrollTimer;
  window.addEventListener('scroll', function() {
    if (productImg) return; // Already found
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(scanForProduct, 500);
  }, { passive: true });

  // Re-scan on DOM mutations (catches dynamically loaded product images)
  var observer = new MutationObserver(function(mutations) {
    if (productImg) return; // Already found
    var hasNewNodes = false;
    for (var i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0) {
        hasNewNodes = true;
        break;
      }
    }
    if (hasNewNodes) {
      setTimeout(scanForProduct, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  log('👀', 'OBSERVERS — Scroll, MutationObserver, and SPA nav hooks active');

  // Notify RN that injection is complete
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'injection_complete',
    url: window.location.href,
  }));

  log('📤', 'READY — Injection complete, notified React Native');
})();
`;
