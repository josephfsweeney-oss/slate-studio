/* Drives the real request handler in-process and reports what the
 * credential-backed routes answer. Run as a child process so each credential
 * mode gets a clean environment; see test/closedroutes.test.js. */
import { handler } from '../../server/index.js';

function fakeReq(method, url, body = null) {
  const chunks = body ? [Buffer.from(body)] : [];
  return {
    method,
    url,
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; },
  };
}

function fakeRes() {
  const out = { code: 0, headers: {}, body: '' };
  return {
    out,
    writeHead(code, headers = {}) { out.code = code; out.headers = headers; },
    end(b) { out.body = b ? String(b) : ''; },
  };
}

async function call(method, url, body) {
  const res = fakeRes();
  await handler(fakeReq(method, url, body), res);
  return { status: res.out.code, body: res.out.body.slice(0, 400) };
}

const result = {
  authStart: await call('GET', '/auth/google'),
  signOut: await call('GET', '/auth/signout'),
  save: await call('POST', '/api/save?name=probe.png', 'x'),
  state: JSON.parse((await call('GET', '/api/state')).body),
};
process.stdout.write(JSON.stringify(result));
