/**
 * @file content/GoogleMeetAdapter.ts
 *
 * Google Meet implementation of `MeetingProviderAdapter`.
 */

import type { MeetingProviderAdapter, CaptionBlockData, MeetingLifecycleState } from './MeetingProviderAdapter';
import type { MeetingProviderInfo } from '../shared/provider';

/**
 * ⚠️  FRAGILE SELECTORS — Reverse-engineered from Google Meet's obfuscated CSS.
 *
 * These WILL break if Google updates their frontend. When captions stop working:
 *   1. Open meet.google.com and start a meeting with captions ON.
 *   2. Open DevTools → Elements and inspect an active caption bubble.
 *   3. Find the element containing the spoken text and update captionText.
 *   4. Find the element containing the speaker's name and update speakerName.
 *   5. Find the parent container (one per active speaker) and update captionBlock.
 *   6. Inspect the captions container and the leave-call button and update
 *      captionsRegion / leaveCallControl.
 *
 * ⚠️  NEVER MATCH ON UI TEXT. Meet localizes every `aria-label`, `data-tooltip`
 * and post-call sentence, so a selector written against English strings silently
 * captures nothing for a user whose Meet runs in any other language — the
 * captions region is never found, and the end detector never sees an active
 * meeting, so recording never auto-stops. Every primary selector here is
 * language-independent (obfuscated `jscontroller`/`jsname` handles, Material
 * Symbols ligature names, DOM structure); the English text patterns are kept
 * only as an extra fallback for when those handles rotate.
 *
 * Last verified: 2026-08 (Meet 8.1.x, verified against a live ru-locale call)
 */
const MEET_SELECTORS = {
  captionText: '.ygicle',
  speakerName: '.NWpY1d',
  captionBlock: '.nMcdL',
  /** Language-independent handle for the captions container. */
  captionsRegion: 'div[role="region"][jscontroller="KPn5nb"]',
  /** English-only fallback, kept for when the jscontroller handle rotates. */
  captionsRegionByLabel: 'div[role="region"][aria-label="Captions"]',
  region: '[role="region"]',
  leaveCallControl: [
    '[jsname="CQylAd"]',
    '[aria-label*="Leave call" i]',
    '[aria-label*="Leave meeting" i]',
    '[data-tooltip*="Leave call" i]',
    '[data-tooltip*="Leave meeting" i]',
  ].join(','),
  /**
   * Material Symbols renders its icon as a ligature name in the element text, and
   * Google marks those nodes `notranslate`, so `call_end` reads the same in every
   * locale.
   */
  materialIcon: 'i.google-symbols, i.google-material-icons, span.google-symbols, span.material-icons',
} as const;

const LEAVE_CALL_ICON_LIGATURE = 'call_end';

/**
 * English-only, and deliberately so: these merely refine an already-detected end
 * into the `'ended'` reason. Losing them in another locale costs nothing — the
 * detector still stops on `'unknown'` once the leave-call control disappears.
 */
const ENDED_TEXT_PATTERNS = [
  /\byou'?ve left the meeting\b/i,
  /\byou left the meeting\b/i,
  /\bthe meeting has ended\b/i,
  /\bthis meeting has ended\b/i,
  /\breturn to home screen\b/i,
  /\brejoin\b/i,
  /\bre-join\b/i,
];

/** True when a leave-call button is on screen, identified by its icon ligature. */
function hasLeaveCallIcon(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll<HTMLElement>(MEET_SELECTORS.materialIcon))
    .some((icon) => icon.textContent?.trim() === LEAVE_CALL_ICON_LIGATURE);
}

export class GoogleMeetAdapter implements MeetingProviderAdapter {
  getProviderInfo(location: Location, _root: ParentNode): MeetingProviderInfo {
    const meetingId = location.pathname.split('/').pop() || null;
    return {
      providerId: 'google-meet',
      meetingId,
      supportsCaptions: true,
    };
  }

  /**
   * Locates the captions container in any Meet locale.
   *
   * Three strategies, cheapest and most precise first: the obfuscated
   * `jscontroller` handle, then the English `aria-label` (kept so an English
   * call keeps working if that handle rotates), then the structural fallback —
   * whichever region currently holds a caption block. The structural pass costs
   * nothing in practice because it only runs when both handles miss.
   */
  findCaptionsRegion(root: ParentNode): HTMLElement | null {
    const byHandle = root.querySelector<HTMLElement>(MEET_SELECTORS.captionsRegion);
    if (byHandle) return byHandle;

    const byLabel = root.querySelector<HTMLElement>(MEET_SELECTORS.captionsRegionByLabel);
    if (byLabel) return byLabel;

    const regions = Array.from(root.querySelectorAll<HTMLElement>(MEET_SELECTORS.region));
    return regions.find((region) => region.querySelector(MEET_SELECTORS.captionBlock)) ?? null;
  }

  collectCaptionBlocks(node: Node): HTMLElement[] {
    if (!(node instanceof HTMLElement)) return [];

    const blocks: HTMLElement[] = [];
    if (node.matches(MEET_SELECTORS.captionBlock)) {
      blocks.push(node);
    }
    node.querySelectorAll<HTMLElement>(MEET_SELECTORS.captionBlock).forEach((block) => blocks.push(block));
    return blocks;
  }

  getCaptionBlockData(block: HTMLElement): CaptionBlockData | null {
    const textNode = block.querySelector<HTMLElement>(MEET_SELECTORS.captionText);
    if (!textNode) return null;

    const speakerName =
      block.querySelector<HTMLElement>(MEET_SELECTORS.speakerName)?.textContent?.trim() ?? ' ';

    return {
      key: block.getAttribute('data-participant-id') || speakerName,
      speakerName,
      textNode,
    };
  }

  getMeetingLifecycleState(root: ParentNode): MeetingLifecycleState {
    if (root.querySelector(MEET_SELECTORS.leaveCallControl)) return 'active';
    if (hasLeaveCallIcon(root)) return 'active';

    const bodyText = root instanceof Document
      ? root.body?.innerText || root.body?.textContent || ''
      : root.textContent || '';
    return ENDED_TEXT_PATTERNS.some((pattern) => pattern.test(bodyText))
      ? 'ended'
      : 'unknown';
  }
}
