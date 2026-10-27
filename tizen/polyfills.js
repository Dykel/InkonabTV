/* Small polyfills for older Samsung TV engines (Tizen 4–6, Chromium 56–85). Loaded first in the
   Tizen package only; each one is skipped when the TV already has the feature. */
(function () {
  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      var o = {};
      Array.from(entries, function (kv) { o[kv[0]] = kv[1]; });
      return o;
    };
  }
  if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, 'flat', {
      configurable: true, writable: true,
      value: function flat(depth) {
        depth = depth === undefined ? 1 : Math.floor(depth);
        return depth < 1 ? this.slice() : this.reduce(function (acc, v) {
          return acc.concat(Array.isArray(v) ? v.flat(depth - 1) : v);
        }, []);
      },
    });
  }
  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, 'flatMap', {
      configurable: true, writable: true,
      value: function flatMap(fn, thisArg) { return this.map(fn, thisArg).flat(); },
    });
  }
  if (!String.prototype.padStart) {
    String.prototype.padStart = function (len, fill) {
      var s = String(this); fill = fill === undefined ? ' ' : String(fill);
      while (s.length < len) s = fill + s;
      return s.slice(s.length - Math.max(len, String(this).length));
    };
  }
  if (typeof Promise !== 'undefined' && !Promise.prototype.finally) {
    Promise.prototype.finally = function (fn) {
      return this.then(function (v) { return Promise.resolve(fn()).then(function () { return v; }); },
        function (e) { return Promise.resolve(fn()).then(function () { throw e; }); });
    };
  }
  // Without IntersectionObserver (Chromium < 58) lazy rows simply load straight away.
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = function (cb) {
      this.observe = function (el) { setTimeout(function () { cb([{ isIntersecting: true, target: el }]); }, 0); };
      this.unobserve = function () {};
      this.disconnect = function () {};
    };
  }
  if (window.Element && !Element.prototype.remove) {
    Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  }
})();
