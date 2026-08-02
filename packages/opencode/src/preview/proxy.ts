export const CONSOLE_BRIDGE = `
(function() {
  var O = {};
  var p = window.opener || window.parent;
  if (!p || p === window) return;

  function send(l, a) {
    try {
      p.postMessage({ source: 'oc-console', level: l, args: a, timestamp: Date.now(), url: location.href }, '*');
    } catch(e) {}
  }

  ['log','warn','error','info','debug'].forEach(function(l) {
    O[l] = console[l];
    console[l] = function() {
      var a = [];
      for (var i = 0; i < arguments.length; i++) {
        try {
          var v = arguments[i];
          if (v instanceof Error) a.push(v.stack || v.message);
          else if (typeof v === 'object' && v !== null) {
            try {
              a.push(JSON.stringify(v, null, 2));
            } catch(e) {
              a.push('[object ' + (v.constructor ? v.constructor.name : 'Object') + ']');
            }
          }
          else a.push(String(v));
        } catch(e) { a.push('[unserializable]'); }
      }
      send(l, a);
      if (O[l]) O[l].apply(console, arguments);
    };
  });

  window.addEventListener('error', function(e) {
    send('error', [e.message + ' at ' + (e.filename || '?') + ':' + e.lineno + ':' + e.colno]);
  });

  window.addEventListener('unhandledrejection', function(e) {
    var m = 'Unhandled rejection: ';
    try { m += (e.reason && e.reason.stack) || (e.reason && e.reason.message) || String(e.reason); }
    catch(x) { m += 'unknown'; }
    send('error', [m]);
  });

  send('debug', ['[console bridge active]']);
})();
`.trim()

export function injectBridge(html: string, base: string, script: string): string {
  const headOpen = /<head[^>]*>/i
  const headClose = /<\/head>/i
  const bodyOpen = /<body/i
  if (headOpen.test(html)) return html.replace(headOpen, `$&${base}${script}`)
  if (headClose.test(html)) return html.replace(headClose, `${base}${script}</head>`)
  if (bodyOpen.test(html)) return html.replace(bodyOpen, `<head>${base}${script}</head><body`)
  return `${base}${script}${html}`
}
