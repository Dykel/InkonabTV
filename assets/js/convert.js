/* Windows app: movies and series whose sound the video engine can't decode (Dolby AC3 / E-AC3,
   DTS) play through the app's converter (desktop/media.js): the same picture with AAC sound,
   streamed as fragmented MP4 into a MediaSource. The video element keeps its own controls:
   the full length shows, and a seek outside what is loaded starts the converter there. */
(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const has = (b, s, from = 0) => {
    for (let i = from; i < b.length - 3; i++)
      if (b[i] === s.charCodeAt(0) && b[i + 1] === s.charCodeAt(1) && b[i + 2] === s.charCodeAt(2) && b[i + 3] === s.charCodeAt(3)) return i;
    return -1;
  };
  const hex = n => n.toString(16).padStart(2, '0');

  // MIME type from the init segment (the video's own codec is passed through unchanged).
  function mimeOf(b) {
    let v = '', i;
    if ((i = has(b, 'avcC')) > 0) v = (has(b, 'avc3') > 0 ? 'avc3' : 'avc1') + '.' + hex(b[i + 5]) + hex(b[i + 6]) + hex(b[i + 7]);
    else if ((i = has(b, 'hvcC')) > 0) {
      const p = b[i + 5] & 31;
      v = `${has(b, 'hev1') > 0 ? 'hev1' : 'hvc1'}.${p}.${p === 2 ? 4 : 6}.L${b[i + 16]}.B0`;
    }
    const codecs = [v, has(b, 'mp4a') > 0 ? 'mp4a.40.2' : ''].filter(Boolean).join(', ');
    return `video/mp4; codecs="${codecs}"`;
  }

  const join = (a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; };
  const ahead = v => {
    const r = v.buffered;
    for (let i = 0; i < r.length; i++) if (r.start(i) <= v.currentTime + 0.5 && r.end(i) >= v.currentTime) return r.end(i) - v.currentTime;
    return -1; // not loaded here
  };
  const done = sb => new Promise((res, rej) => {
    const ok = () => { sb.removeEventListener('error', no); res(); };
    const no = () => { sb.removeEventListener('updateend', ok); rej(new Error('append')); };
    sb.addEventListener('updateend', ok, { once: true });
    sb.addEventListener('error', no, { once: true });
  });

  // Plays `src` (the provider's address) in `video` from `at` seconds; onFail(reason).
  // Returns stop().
  window.ConvertedPlayback = function (video, base, src, at, onFail) {
    const ms = new MediaSource();
    let sb = null, ctrl = null, stopped = false, durationSet = false;
    video.src = URL.createObjectURL(ms);

    async function from(t) {
      if (ctrl) ctrl.abort();
      const my = ctrl = new AbortController();
      try {
        if (sb) {
          if (sb.updating) { sb.abort(); }
          if (sb.buffered.length) { sb.remove(0, Infinity); await done(sb); }
        }
        const r = await fetch(`${base}/convert?u=${encodeURIComponent(src)}&ss=${t.toFixed(2)}`, { signal: my.signal });
        if (!r.ok) throw new Error('convert ' + r.status);
        const dur = Number(r.headers.get('X-Duration'));
        const reader = r.body.getReader();
        let head = new Uint8Array(0), placed = false;
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end || my.signal.aborted) break;
          let data = value;
          if (!placed) { // hold back until the init segment is complete
            head = join(head, value);
            if (has(head, 'moof') < 0) continue;
            data = head;
            if (!sb) {
              const mime = mimeOf(head);
              if (!MediaSource.isTypeSupported(mime)) throw new Error('unsupported ' + mime);
              sb = ms.addSourceBuffer(mime);
            }
            if (!durationSet && dur > 0) { ms.duration = dur; durationSet = true; }
          }
          // Keep about 90 s loaded: the converter waits (and so does the provider) meanwhile.
          while (!my.signal.aborted && ahead(video) > 90) await sleep(500);
          if (my.signal.aborted) break;
          if (video.currentTime > 60 && sb.buffered.length && sb.buffered.start(0) < video.currentTime - 45) {
            sb.remove(0, video.currentTime - 30); await done(sb);
          }
          sb.appendBuffer(data); await done(sb);
          if (!placed) { placed = true; if (Math.abs(video.currentTime - t) > 1) video.currentTime = t; }
        }
        if (!my.signal.aborted && ms.readyState === 'open' && !sb.updating) ms.endOfStream();
      } catch (e) {
        if (!my.signal.aborted && !stopped) onFail(e.message || String(e));
      }
    }

    const onSeeking = () => { if (sb && ahead(video) < 0) from(video.currentTime); };
    video.addEventListener('seeking', onSeeking);
    ms.addEventListener('sourceopen', () => from(at), { once: true });

    return function stop() {
      stopped = true;
      if (ctrl) ctrl.abort();
      video.removeEventListener('seeking', onSeeking);
      URL.revokeObjectURL(video.src);
    };
  };
})();
