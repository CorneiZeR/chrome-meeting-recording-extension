import { RecordingNameDialog } from '../RecordingNameDialog';

const input = () => document.querySelector<HTMLInputElement>('.recording-name-input')!;
const save = () => document.querySelector<HTMLButtonElement>('[data-recording-name-save]')!;
const cancel = () => document.querySelector<HTMLButtonElement>('[data-recording-name-cancel]')!;
const overlay = () => document.querySelector<HTMLElement>('.recording-name-overlay')!;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RecordingNameDialog', () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it('prefills, focuses, and selects the current recording name', () => {
    const dialog = new RecordingNameDialog();
    void dialog.ask({
      title: 'Name recording', message: 'Choose a name', initialValue: 'Default recording', onSave: async () => {},
    });

    expect(input().value).toBe('Default recording');
    expect(document.activeElement).toBe(input());
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe('Default recording'.length);
  });

  it('validates blank and punctuation-only values without closing', async () => {
    const onSave = jest.fn();
    const dialog = new RecordingNameDialog();
    void dialog.ask({ title: 'Name recording', message: 'Choose a name', initialValue: '', onSave });

    save().click();
    expect(document.querySelector('.recording-name-error')?.textContent).toContain('blank');
    input().value = '---';
    save().click();
    expect(document.querySelector('.recording-name-error')?.textContent).toContain('letter or number');
    expect(onSave).not.toHaveBeenCalled();
    expect(overlay().hidden).toBe(false);
  });

  it('keeps the modal open with an inline error when saving fails', async () => {
    const dialog = new RecordingNameDialog();
    void dialog.ask({
      title: 'Name recording', message: 'Choose a name', initialValue: 'Default',
      onSave: async () => { throw new Error('Drive unavailable'); },
    });
    input().value = 'Quarterly Review';
    save().click();
    await flush();

    expect(document.querySelector('.recording-name-error')?.textContent).toBe('Drive unavailable');
    expect(overlay().hidden).toBe(false);
    expect(input().disabled).toBe(false);
  });

  it('disables controls while saving and resolves only after success', async () => {
    let resolveSave!: () => void;
    const onSave = jest.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const dialog = new RecordingNameDialog();
    const outcome = dialog.ask({ title: 'Name recording', message: 'Choose a name', initialValue: 'Default', onSave });
    input().value = 'Quarterly Review';
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(save().disabled).toBe(true);
    expect(cancel().disabled).toBe(true);
    expect(save().textContent).toBe('Saving…');
    resolveSave();
    await expect(outcome).resolves.toBe('saved');
    expect(onSave).toHaveBeenCalledWith('Quarterly Review');
    expect(overlay().hidden).toBe(true);
  });

  it('cancels on Escape and restores the previously focused element', async () => {
    const prior = document.createElement('button');
    document.body.appendChild(prior);
    prior.focus();
    const dialog = new RecordingNameDialog();
    const outcome = dialog.ask({ title: 'Name recording', message: 'Choose a name', initialValue: 'Default', onSave: async () => {} });
    overlay().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await expect(outcome).resolves.toBe('canceled');
    expect(document.activeElement).toBe(prior);
  });

  it('traps focus between the input and cancel button', () => {
    const dialog = new RecordingNameDialog();
    void dialog.ask({ title: 'Name recording', message: 'Choose a name', initialValue: 'Default', onSave: async () => {} });
    cancel().focus();
    cancel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(input());
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(cancel());
  });
});
