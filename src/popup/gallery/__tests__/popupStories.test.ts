import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applyPopupStory, POPUP_STORIES, POPUP_VIEW_IDS } from '../popupStories';

const popupMarkup = readFileSync(resolve(process.cwd(), 'static/popup.html'), 'utf8');
const popupDocument = new DOMParser().parseFromString(popupMarkup, 'text/html');
popupDocument.querySelectorAll('script').forEach((script) => script.remove());
const popupBody = popupDocument.body.innerHTML;

describe('popup gallery stories', () => {
  test('story ids are unique', () => {
    const ids = POPUP_STORIES.map((story) => story.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(POPUP_STORIES.map((story) => [story.id, story] as const))(
    '%s applies to the real popup markup and leaves one top-level view visible',
    (id, story) => {
      document.body.innerHTML = popupBody;
      expect(() => applyPopupStory(document, id)).not.toThrow();
      expect(document.documentElement.dataset.popupStory).toBe(id);
      expect(story.title).not.toHaveLength(0);
      const visibleViews = POPUP_VIEW_IDS.filter((viewId) => !document.getElementById(viewId)?.hidden);
      expect(visibleViews).toHaveLength(1);
    },
  );
});
