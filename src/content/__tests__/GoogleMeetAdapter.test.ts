import { GoogleMeetAdapter } from '../GoogleMeetAdapter';

function makeLocation(pathname: string): Location {
  return { pathname } as Location;
}

describe('GoogleMeetAdapter', () => {
  const adapter = new GoogleMeetAdapter();

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns provider metadata without camera state', () => {
    expect(adapter.getProviderInfo(makeLocation('/abc-defg-hij'), document)).toEqual({
      providerId: 'google-meet',
      meetingId: 'abc-defg-hij',
      supportsCaptions: true,
    });
  });

  it('recognizes an active meeting from the leave-call control', () => {
    const leaveButton = document.createElement('button');
    leaveButton.setAttribute('aria-label', 'Leave call');
    document.body.appendChild(leaveButton);

    expect(adapter.getMeetingLifecycleState(document)).toBe('active');
  });

  it('recognizes an active meeting in a non-English Meet via the leave-call handle', () => {
    const leaveButton = document.createElement('button');
    leaveButton.setAttribute('jsname', 'CQylAd');
    leaveButton.setAttribute('aria-label', 'Покинуть видеовстречу');
    document.body.appendChild(leaveButton);

    expect(adapter.getMeetingLifecycleState(document)).toBe('active');
  });

  it('recognizes an active meeting from the call_end icon ligature alone', () => {
    const leaveButton = document.createElement('button');
    leaveButton.setAttribute('aria-label', 'Videoanruf verlassen');
    const icon = document.createElement('i');
    icon.className = 'quRWN-Bz112c google-symbols notranslate';
    icon.textContent = 'call_end';
    leaveButton.appendChild(icon);
    document.body.appendChild(leaveButton);

    expect(adapter.getMeetingLifecycleState(document)).toBe('active');
  });

  it('recognizes a post-call state from ended meeting text', () => {
    document.body.textContent = 'You left the meeting Rejoin';

    expect(adapter.getMeetingLifecycleState(document)).toBe('ended');
  });

  it('reports an unknown lifecycle state when no controls or ended text are present', () => {
    document.body.textContent = 'Meeting in progress, audio connected';
    expect(adapter.getMeetingLifecycleState(document)).toBe('unknown');
  });

  it('detects ended state from a non-Document root via textContent', () => {
    const root = document.createElement('div');
    root.textContent = 'This meeting has ended';
    expect(adapter.getMeetingLifecycleState(root)).toBe('ended');
  });

  describe('caption DOM helpers', () => {
    function makeBlock(opts: { id?: string; speaker?: string; text?: string | null } = {}): HTMLElement {
      const block = document.createElement('div');
      block.className = 'nMcdL';
      if (opts.id) block.setAttribute('data-participant-id', opts.id);
      if (opts.speaker !== undefined) {
        const speaker = document.createElement('div');
        speaker.className = 'NWpY1d';
        speaker.textContent = opts.speaker;
        block.appendChild(speaker);
      }
      if (opts.text !== null) {
        const text = document.createElement('div');
        text.className = 'ygicle';
        text.textContent = opts.text ?? 'hello';
        block.appendChild(text);
      }
      return block;
    }

    it('finds the captions region, or null when absent', () => {
      expect(adapter.findCaptionsRegion(document)).toBeNull();
      const region = document.createElement('div');
      region.setAttribute('role', 'region');
      region.setAttribute('aria-label', 'Captions');
      document.body.appendChild(region);
      expect(adapter.findCaptionsRegion(document)).toBe(region);
    });

    it('finds the captions region in a non-English Meet, where aria-label is localized', () => {
      const region = document.createElement('div');
      region.setAttribute('role', 'region');
      region.setAttribute('aria-label', 'Субтитры');
      region.setAttribute('jscontroller', 'KPn5nb');
      document.body.appendChild(region);

      expect(adapter.findCaptionsRegion(document)).toBe(region);
    });

    it('falls back to the region holding caption blocks when both handles miss', () => {
      const region = document.createElement('div');
      region.setAttribute('role', 'region');
      region.setAttribute('aria-label', 'Untertitel');
      region.appendChild(makeBlock({ id: 'u1' }));
      document.body.appendChild(region);

      expect(adapter.findCaptionsRegion(document)).toBe(region);
    });

    it('finds the captions toggle by its language-independent handle', () => {
      const button = document.createElement('button');
      button.setAttribute('jsname', 'RrG0hf');
      button.setAttribute('aria-label', 'Отключить субтитры');
      document.body.appendChild(button);

      expect(adapter.findCaptionsToggle(document)).toBe(button);
    });

    it.each(['closed_caption', 'closed_caption_off', 'closed_caption_disabled'])(
      'finds the captions toggle by its %s icon when the handle rotates',
      (ligature) => {
        const button = document.createElement('button');
        const icon = document.createElement('i');
        icon.className = 'google-symbols notranslate';
        icon.textContent = ligature;
        button.appendChild(icon);
        document.body.appendChild(button);

        expect(adapter.findCaptionsToggle(document)).toBe(button);
      },
    );

    it('returns null when no captions control is on screen', () => {
      expect(adapter.findCaptionsToggle(document)).toBeNull();
    });

    it('collects caption blocks within a container', () => {
      const container = document.createElement('div');
      container.appendChild(makeBlock({ id: 'u1' }));
      container.appendChild(makeBlock({ id: 'u2' }));
      expect(adapter.collectCaptionBlocks(container)).toHaveLength(2);
    });

    it('includes the node itself when it is a caption block', () => {
      const block = makeBlock({ id: 'u1' });
      expect(adapter.collectCaptionBlocks(block)).toEqual([block]);
    });

    it('returns an empty list for non-element nodes', () => {
      expect(adapter.collectCaptionBlocks(document.createTextNode('text'))).toEqual([]);
    });

    it('extracts caption block data keyed by participant id', () => {
      const block = makeBlock({ id: 'user-7', speaker: 'John Doe', text: 'Hi' });
      const data = adapter.getCaptionBlockData(block);
      expect(data).toMatchObject({ key: 'user-7', speakerName: 'John Doe' });
      expect(data?.textNode.textContent).toBe('Hi');
    });

    it('falls back to the speaker name as the key when no participant id exists', () => {
      const block = makeBlock({ speaker: 'Jane Doe' });
      expect(adapter.getCaptionBlockData(block)?.key).toBe('Jane Doe');
    });

    it('returns null when the block has no caption text node', () => {
      const block = makeBlock({ id: 'u1', speaker: 'John', text: null });
      expect(adapter.getCaptionBlockData(block)).toBeNull();
    });
  });
});
