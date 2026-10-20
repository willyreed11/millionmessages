/* millionmessages.us embed
   Usage, anywhere in a web page:
     <script src="https://millionmessages.us/embed.js" async></script>
   It inserts an iframe of https://millionmessages.us/embed where the script
   tag sits. The iframe runs on our domain, so the host page cannot read or
   alter anything inside it, and the human check works everywhere. */
(function () {
  var ORIGIN = "https://millionmessages.us";
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName("script");
    return s[s.length - 1];
  })();
  var frame = document.createElement("iframe");
  frame.src = ORIGIN + "/embed";
  frame.title = "Million Messages — write to the White House";
  frame.setAttribute("loading", "lazy");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  frame.style.cssText = "width:100%;max-width:560px;height:720px;border:0;display:block;margin:0 auto;";
  if (script && script.parentNode) script.parentNode.insertBefore(frame, script.nextSibling);
  else document.body.appendChild(frame);
  window.addEventListener("message", function (ev) {
    if (ev.origin !== ORIGIN || !ev.data || typeof ev.data.mmEmbedHeight !== "number") return;
    if (ev.source !== frame.contentWindow) return;
    frame.style.height = Math.max(200, ev.data.mmEmbedHeight + 8) + "px";
  });
})();
