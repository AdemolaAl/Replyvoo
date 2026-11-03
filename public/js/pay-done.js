/* "Payment done" window opened from Joinvoo: tells Joinvoo (only its own origin) how the checkout ended, then closes. */
(function () {
  var d = {};
  try { d = JSON.parse(document.getElementById('payDone').textContent || '{}'); } catch (e) { d = {}; }
  try { if (window.opener && d.origin && d.msg) window.opener.postMessage(d.msg, d.origin); } catch (e) { /* the opener went away */ }
  var b = document.getElementById('pdClose'); if (b) b.addEventListener('click', function () { window.close(); });
  if (d.close) setTimeout(function () { window.close(); }, 1600);
})();
