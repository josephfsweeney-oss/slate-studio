/* The five Drive calls this app needs. */
import { accessToken } from './google-auth.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function auth() {
  const t = await accessToken();
  if (!t) throw new Error('not signed in to Google Drive');
  return { authorization: `Bearer ${t}` };
}

/** Every file matching `q`, following pagination. */
export async function list(q, fields = 'id,name,mimeType,parents,size') {
  const headers = await auth();
  const out = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q, pageSize: '1000', fields: `nextPageToken,files(${fields})`,
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      spaces: 'drive',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`${API}/files?${params}`, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(`drive list: ${json.error?.message || res.status}`);
    out.push(...(json.files || []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export async function download(id) {
  const headers = await auth();
  const res = await fetch(`${API}/files/${id}?alt=media&supportsAllDrives=true`, { headers });
  if (!res.ok) throw new Error(`drive download ${id}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadText(id) {
  return (await download(id)).toString('utf8');
}

/** Find, or create, a folder the app owns. */
export async function ensureFolder(name, parentId) {
  const esc = name.replace(/'/g, "\\'");
  const q = `name = '${esc}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    + (parentId ? ` and '${parentId}' in parents` : '');
  const found = await list(q, 'id,name');
  if (found.length) return found[0].id;
  const headers = await auth();
  const res = await fetch(`${API}/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      name, mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`drive mkdir: ${json.error?.message || res.status}`);
  return json.id;
}

export async function upload(name, parentId, buffer, mime = 'image/png') {
  const headers = await auth();
  const boundary = 'slatestudio' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, ...(parentId ? { parents: [parentId] } : {}) });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { ...headers, 'content-type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`drive upload: ${json.error?.message || res.status}`);
  return json;
}
