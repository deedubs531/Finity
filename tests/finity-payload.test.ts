import { describe, expect, it } from 'vitest';
import { fromFinityPayload } from '../src/shelf';

const payload = (items: unknown[]) => 'finity:v1:' + JSON.stringify({ items });

describe('fromFinityPayload', () => {
  it('ignores ordinary clipboard text', () => {
    expect(fromFinityPayload('https://example.com')).toBeNull();
    expect(fromFinityPayload('finity:v1:{broken')).toBeNull();
  });

  it('turns posts into shelf items and events into radar events', () => {
    const result = fromFinityPayload(
      payload([
        { kind: 'shelf', url: 'https://www.instagram.com/p/abc/', text: 'Mural day', source: '@maya on Instagram', image: 'data:image/jpeg;base64,AAAA' },
        { kind: 'event', url: 'https://www.instagram.com/p/def/', title: 'Zine fair', date: '2026-10-10', time: '14:00', location: 'Union Hall', source: '@zinefest on Instagram' },
        { kind: 'event', title: 'Bad date', date: 'soon' },
      ]),
    )!;
    expect(result.shelf).toHaveLength(1);
    expect(result.shelf[0]).toMatchObject({ text: 'Mural day', url: 'https://www.instagram.com/p/abc/', image: 'data:image/jpeg;base64,AAAA', sourceName: '@maya on Instagram' });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ title: 'Zine fair', allDay: false, location: 'Union Hall', manual: true, start: new Date('2026-10-10T14:00').getTime() });
  });

  it('drops unsafe links and images', () => {
    const [item] = fromFinityPayload(payload([{ kind: 'shelf', url: 'javascript:alert(1)', image: 'data:text/html;base64,PHNjcmlwdD4=' }]))!.shelf;
    expect(item.url).toBeUndefined();
    expect(item.image).toBeUndefined();
  });
});
