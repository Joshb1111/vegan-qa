// Minimal headless-Chrome driver for the Far Field tests (docs/farfield/tests/). Serves:
//   /            -> <repo>/public          (the game as shipped)
//   /__ff/       -> this folder            (test helpers)
//   /__docs/     -> <repo>/docs
// One Chrome per run, on its own ports; its profile lives in the OS temp dir and is deleted on close.
// launch({w,h,gpu}) -> {ev, shot, nav, close, errs}
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawn } from 'node:child_process';
const FF = path.dirname(new URL(import.meta.url).pathname), ROOT = path.resolve(FF, '../../..');
const PUB = path.join(ROOT, 'public'), DOCS = path.join(ROOT, 'docs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css', '.bin': 'application/octet-stream' };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function serve(port) {
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); let f;
    if (u.startsWith('/__ff/')) f = path.join(FF, u.slice(6)); else if (u.startsWith('/__docs/')) f = path.join(DOCS, u.slice(8)); else f = path.join(PUB, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (req.method === 'PUT' && u.startsWith('/__ff/out/')) { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.concat(ch)); res.writeHead(200); res.end('ok'); }); return; }
    fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d); });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
export async function launch({ w = 1600, h = 900, gpu = false, port = 9851, dport = 9852 } = {}) {
  const srv = await serve(port);
  const UDD = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-chrome-'));
  const args = ['--headless=new', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--user-data-dir=' + UDD, '--remote-debugging-port=' + dport, `--window-size=${w},${h}`, '--force-device-scale-factor=' + (process.env.DSF || 1), '--ignore-gpu-blocklist'];
  if (gpu) args.push('--use-angle=metal', '--enable-gpu');
  if (process.env.UNCAPPED) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit'); else args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  const ch = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [...args, 'about:blank'], { stdio: 'ignore' });
  const close = () => { try { ch.kill('SIGKILL'); } catch (e) {} try { srv.close(); } catch (e) {} try { fs.rmSync(UDD, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', close);
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { const r = await fetch(`http://127.0.0.1:${dport}/json/list`, { signal: AbortSignal.timeout(2000) }); const l = await r.json(); const p = l.find(x => x.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch (e) {} }
  if (!wsUrl) { close(); throw new Error('no chrome'); }
  const ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(); const errs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled') { const t = m.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ').slice(0, 400); if (m.params.type === 'error' || m.params.type === 'warning') errs.push(m.params.type + ' ' + t); else if (process.env.LOGS) console.log('[page]', t); }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push('LOG ' + m.params.entry.text.slice(0, 200) + ' ' + (m.params.entry.url || '')); };
  const cdp = (method, params = {}, to = 60000) => new Promise((res, rej) => { const i = ++id; const t = setTimeout(() => { pend.delete(i); rej(new Error('timeout ' + method)); }, to); pend.set(i, m => { clearTimeout(t); m.error ? rej(new Error(method + ' ' + JSON.stringify(m.error))) : res(m.result); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr, to = 120000) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, to); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result.value; };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: +(process.env.DSF || 1), mobile: false });
  const nav = async (url, readyExpr = 'true', to = 120000) => { await cdp('Page.navigate', { url: `http://127.0.0.1:${port}${url}` }); const t0 = Date.now(); for (;;) { await sleep(300); let ok = false; try { ok = await ev(readyExpr, 20000); } catch (e) {} if (ok) return; if (Date.now() - t0 > to) throw new Error('nav timeout ' + url + ' errs=' + JSON.stringify(errs.slice(-5))); } };
  const shot = async (file, q = 88, clip) => { const p = { format: file.endsWith('.png') ? 'png' : 'jpeg' }; if (p.format === 'jpeg') p.quality = q; if (clip) p.clip = { ...clip, scale: 1 }; const r = await cdp('Page.captureScreenshot', p, 120000); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file; };
  const resize = async (W, H) => { await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }); };
  return { ev, shot, nav, close, errs, cdp, resize, FF };
}
