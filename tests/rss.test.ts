import { describe, expect, it } from 'vitest';
import { parseFeed } from '../src/sources/rss';

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Small Blog</title>
  <link>https://blog.example.com/</link>
  <item>
    <title>Hello &amp; welcome</title>
    <link>https://blog.example.com/hello</link>
    <guid>post-1</guid>
    <pubDate>Tue, 06 Oct 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[<p>First <b>post</b>.</p><script>alert(1)</script><img src="/img/a.jpg">]]></description>
  </item>
  <item>
    <title>With media</title>
    <link>https://blog.example.com/media</link>
    <media:thumbnail url="https://cdn.example.com/t.jpg"/>
    <description>Plain text</description>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Site</title>
  <link href="https://atom.example.org/"/>
  <entry>
    <title>Entry one</title>
    <link rel="alternate" href="https://atom.example.org/1"/>
    <id>tag:atom.example.org,2026:1</id>
    <updated>2026-10-05T08:00:00Z</updated>
    <summary type="html">&lt;p&gt;Summary text&lt;/p&gt;</summary>
  </entry>
</feed>`;

describe('parseFeed', () => {
  it('reads RSS 2.0 items as plain text, without scripts', () => {
    const feed = parseFeed(RSS, 'https://blog.example.com/feed');
    expect(feed.title).toBe('Small Blog');
    expect(feed.entries).toHaveLength(2);
    const [first, second] = feed.entries;
    expect(first.title).toBe('Hello & welcome');
    expect(first.text).toBe('First post.');
    expect(first.url).toBe('https://blog.example.com/hello');
    expect(first.image).toBe('https://blog.example.com/img/a.jpg');
    expect(first.published).toBe(Date.parse('2026-10-06T10:00:00Z'));
    expect(second.image).toBe('https://cdn.example.com/t.jpg');
  });

  it('gives each item a stable id', () => {
    const a = parseFeed(RSS, 'https://blog.example.com/feed').entries[0].id;
    const b = parseFeed(RSS, 'https://blog.example.com/feed').entries[0].id;
    expect(a).toBe(b);
  });

  it('reads Atom entries', () => {
    const feed = parseFeed(ATOM, 'https://atom.example.org/feed.xml');
    expect(feed.title).toBe('Atom Site');
    expect(feed.entries[0]).toMatchObject({ title: 'Entry one', url: 'https://atom.example.org/1', text: 'Summary text' });
  });

  it('rejects links that are not http(s)', () => {
    const evil = RSS.replace('https://blog.example.com/hello', 'javascript:alert(1)');
    expect(parseFeed(evil, 'https://blog.example.com/feed').entries[0].url).toBeUndefined();
  });

  it('throws a friendly error for broken XML', () => {
    expect(() => parseFeed('<rss><channel>', 'https://x.example/feed')).toThrow('could not be read');
  });
});
