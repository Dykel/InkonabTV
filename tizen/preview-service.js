// Samsung Smart Hub Preview: the rows shown under the app's tile on the TV's home bar.
// The app (tizen.js → TizenHome) starts this service with the rows to show; Smart Hub also
// starts it on its own (no rows then: the ones set last stay). Packaged by scripts/build-tizen.mjs.
module.exports.onStart = function () {};

module.exports.onRequest = function () {
  var app = tizen.application.getCurrentApplication();
  var rows = null;
  try {
    var req = app.getRequestedAppControl();
    (req.appControl.data || []).forEach(function (d) { if (d.key === 'preview') rows = d.value[0]; });
  } catch (e) {}
  if (!rows) return;
  var done = function () { try { app.exit(); } catch (e) {} };
  try {
    webapis.preview.setPreviewData(rows, function () { console.log('[preview] rows set'); done(); },
      function (e) { console.log('[preview] not set: ' + (e && e.message)); done(); });
  } catch (e) {
    console.log('[preview] error: ' + e.message);
    done();
  }
};

module.exports.onExit = function () {};
