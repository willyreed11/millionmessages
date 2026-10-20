/* millionmessages.us — page logic shared by index.html and embed.html.
   No cookies, no analytics, no third-party scripts except Cloudflare Turnstile
   (the human check), which loads only when a site key is configured. */
(function () {
  "use strict";
  var cfg = window.MM_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };

  var countEl = $("count");
  var msgEl = $("message");
  var copyBtn = $("copy");
  var openBtn = $("open");
  var sentBtn = $("sent");
  var sentWrap = $("sent-wrap");
  var statusEl = $("status");
  var tsEl = $("turnstile");
  var LS_KEY = "mm_sent_on";

  if (msgEl) msgEl.textContent = cfg.message || "";
  if (openBtn) { openBtn.href = cfg.formUrl || "#"; openBtn.addEventListener("click", function () { event("open"); }); }

  function fmt(n) { return n === null || n === undefined ? "—" : Number(n).toLocaleString(); }
  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  // ---- live count ------------------------------------------------------
  var lastCount = null;
  function refresh() {
    fetch("/api/count", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (typeof d.count === "number") {
          if (countEl) countEl.textContent = fmt(d.count);
          lastCount = d.count;
        }
      })
      .catch(function () { /* leave previous value */ });
  }
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, 120000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });

  // ---- aggregate funnel counters (totals only; nothing about the visitor) ----
  function event(type) {
    try {
      var body = JSON.stringify({ type: type });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }
  var pageType = document.body.classList.contains("embed") ? "view_embed"
               : document.body.classList.contains("about") ? "view_about" : "view";
  event(pageType);

  // ---- copy ----------------------------------------------------------------
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", "");
    ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  if (copyBtn) copyBtn.addEventListener("click", function () {
    event("copy");
    var text = cfg.message || "";
    var done = function () {
      copyBtn.textContent = "Copied ✓";
      setStatus("Message copied. Now open the form, paste it into the Comments box, and fill in your details.", "ok");
      setTimeout(function () { copyBtn.textContent = "Copy the message"; }, 3000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { if (fallbackCopy(text)) done(); });
    } else if (fallbackCopy(text)) done();
  });

  // ---- "I sent it" -----------------------------------------------------
  var alreadyToday = false;
  try {
    var today = new Date().toISOString().slice(0, 10);
    alreadyToday = localStorage.getItem(LS_KEY) === today;
  } catch (e) {}

  function markDone(text) {
    if (sentBtn) { sentBtn.disabled = true; sentBtn.textContent = "Counted ✓ — thank you"; }
    if (tsEl) tsEl.style.display = "none";
    setStatus(text || "", "ok");
    try { localStorage.setItem(LS_KEY, new Date().toISOString().slice(0, 10)); } catch (e) {}
  }

  if (alreadyToday && sentBtn) {
    sentBtn.disabled = true;
    sentBtn.textContent = "Already counted today ✓";
    if (tsEl) tsEl.style.display = "none";
  }

  // Turnstile: load the script only if a site key is configured.
  var turnstileToken = null;
  if (cfg.turnstileSiteKey && tsEl && !alreadyToday) {
    window.mmTurnstileReady = function () {
      window.turnstile.render(tsEl, {
        sitekey: cfg.turnstileSiteKey,
        size: "normal",
        callback: function (token) { turnstileToken = token; if (sentBtn) sentBtn.disabled = false; },
        "expired-callback": function () { turnstileToken = null; if (sentBtn) sentBtn.disabled = true; },
        "error-callback": function () { turnstileToken = null; setStatus("Human check failed to load. Please reload the page.", "err"); },
      });
    };
    if (sentBtn) sentBtn.disabled = true;
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=mmTurnstileReady&render=explicit";
    s.async = true; s.defer = true;
    document.head.appendChild(s);
  } else if (tsEl) {
    tsEl.style.display = "none";
  }

  if (sentBtn) sentBtn.addEventListener("click", function () {
    if (sentBtn.disabled) return;
    sentBtn.disabled = true;
    setStatus("Recording…");
    var body = { token: turnstileToken, website: ($("website") || {}).value || "" };
    fetch("/api/sent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        var d = res.d || {};
        if (res.ok && d.counted) {
          if (countEl) countEl.textContent = fmt(d.count);
          markDone("You're counted. Thank you.");
        } else if (res.ok && d.reason === "already-counted-today") {
          if (countEl) countEl.textContent = fmt(d.count);
          markDone("You've already been counted today. Thank you.");
        } else if (res.ok && d.reason === "rejected") {
          setStatus("Not counted.", "err");
        } else {
          sentBtn.disabled = false;
          setStatus("Something went wrong (" + (d.error || res.status) + "). Please try again.", "err");
          if (window.turnstile && tsEl) { try { window.turnstile.reset(tsEl); } catch (e) {} }
        }
      })
      .catch(function () {
        sentBtn.disabled = false;
        setStatus("Network error. Please try again.", "err");
      });
  });

  // ---- share ---------------------------------------------------------------
  var shareBtn = $("share");
  var shareStatus = $("share-status");
  function setShareStatus(t) { if (shareStatus) shareStatus.textContent = t || ""; if (shareStatus) shareStatus.className = "status ok"; }
  if (shareBtn) shareBtn.addEventListener("click", function () {
    event("share");
    var url = "https://millionmessages.us/";
    var text = (cfg.shareText || "") ;
    if (navigator.share) {
      navigator.share({ title: "Million Messages", text: text, url: url }).catch(function () {});
    } else {
      var payload = text ? text + " " + url : url;
      var done = function () { setShareStatus("Link copied — paste it into a message or post."); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(done, function () { if (fallbackCopy(payload)) done(); });
      } else if (fallbackCopy(payload)) done();
    }
  });

  // ---- version history (main page only) ---------------------------------
  var vh = $("version-history");
  if (vh && cfg.versionHistory) {
    cfg.versionHistory.forEach(function (v) {
      var li = document.createElement("li");
      li.textContent = v.date + " — " + v.note;
      vh.appendChild(li);
    });
  }
  var src = $("source-link");
  if (src) {
    if (cfg.sourceUrl) { src.href = cfg.sourceUrl; }
    else { src.textContent = "Source code: link coming soon"; src.removeAttribute("href"); }
  }
  var embedCode = $("embed-code");
  if (embedCode) {
    embedCode.textContent = '<script src="https://millionmessages.us/embed.js" async></script>';
  }

  // Tell a parent page (embed) how tall we are so the iframe fits.
  function postHeight() {
    if (window.parent === window) return;
    try { window.parent.postMessage({ mmEmbedHeight: document.documentElement.scrollHeight }, "*"); } catch (e) {}
  }
  if (document.body.classList.contains("embed")) {
    postHeight();
    window.addEventListener("resize", postHeight);
    setInterval(postHeight, 1000);
  }
})();
