// Reads the "following" list from Instagram's own data download
// (Accounts Center → Download your information). The file is read on the
// phone; nothing in it is uploaded anywhere.
import { strFromU8, unzipSync } from 'fflate';

const FOLLOWING_FILE = /(^|\/)following\.(json|html)$/i;

function usernameFromHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    // Newer exports link to /_u/<name>.
    const name = parts[0] === '_u' ? parts[1] : parts[0];
    return name;
  } catch {
    return undefined;
  }
}

function clean(name: string | undefined): string | undefined {
  const n = name?.trim().replace(/^@/, '').toLowerCase();
  return n && /^[a-z0-9._]{1,30}$/.test(n) ? n : undefined;
}

interface StringListEntry {
  href?: string;
  value?: string;
}

interface Relationship {
  title?: string;
  string_list_data?: StringListEntry[];
}

/** Both the older format ("value" holds the name) and the newer one ("title" holds it). */
export function parseFollowingJson(text: string): string[] {
  const data = JSON.parse(text) as Record<string, unknown> | Relationship[];
  const list = (Array.isArray(data) ? data : (data.relationships_following ?? Object.values(data).find(Array.isArray) ?? [])) as Relationship[];
  const names: string[] = [];
  for (const rel of list) {
    const entry = rel.string_list_data?.[0];
    const name = clean(entry?.value) ?? clean(rel.title) ?? clean(usernameFromHref(entry?.href));
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

export function parseFollowingHtml(html: string): string[] {
  const names: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"']*instagram\.com[^"']*)["']/gi)) {
    const name = clean(usernameFromHref(m[1].replace(/&amp;/g, '&')));
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

function parseByName(name: string, text: string): string[] {
  return name.toLowerCase().endsWith('.json') ? parseFollowingJson(text) : parseFollowingHtml(text);
}

/** Accepts the downloaded .zip, or following.json / following.html taken out of it. */
export async function readInstagramExport(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    try {
      return parseByName(file.name, strFromU8(bytes));
    } catch {
      throw new Error("That file isn't an Instagram following list. Choose the .zip Instagram sent you.");
    }
  }
  let files: Record<string, Uint8Array>;
  try {
    // Only unpack the following list, so a big export with photos stays fast.
    files = unzipSync(bytes, { filter: (f) => FOLLOWING_FILE.test(f.name) });
  } catch {
    throw new Error("Finity couldn't open that zip file.");
  }
  const names = Object.keys(files).sort((a, b) => (a.endsWith('.json') ? -1 : 1) - (b.endsWith('.json') ? -1 : 1));
  if (!names.length) {
    throw new Error('No following list in that file. When requesting your download, choose "Followers and following".');
  }
  return parseByName(names[0], strFromU8(files[names[0]]));
}
