// The hub's only script. It makes the copy buttons work and, when a visitor
// arrives with ?from=<tool-id>, thanks them for that tool and tags the Stripe
// links so the payment records which tool the tip came from.
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy]');
    if (!btn) return;
    var text = btn.getAttribute('data-copy');
    var done = function (ok) {
      btn.textContent = ok ? 'Copied' : 'Select it and copy';
      setTimeout(function () { btn.textContent = 'Copy address'; }, 2000);
    };
    try {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } catch (err) {
      done(false);
    }
  });

  var from = new URLSearchParams(location.search).get('from');
  if (from && /^[a-z0-9-]{1,64}$/.test(from)) {
    document.querySelectorAll('a[data-stripe]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        u.searchParams.set('client_reference_id', from);
        a.href = u.toString();
      } catch (err) {
        // A placeholder link; leave it alone.
      }
    });
    var dataEl = document.getElementById('hub-data');
    var data = {};
    try {
      data = JSON.parse(dataEl ? dataEl.textContent : '{}');
    } catch (err) {
      data = {};
    }
    var tool = data.tools && data.tools[from];
    var note = document.getElementById('from-note');
    if (tool && note) {
      note.textContent = tool.thanks_text || 'Thanks for using ' + tool.name + '.';
      note.hidden = false;
    }
  }

  if (location.hash === '#more') {
    var more = document.getElementById('more');
    if (more) more.open = true;
  }
})();
