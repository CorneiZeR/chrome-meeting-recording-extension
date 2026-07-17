/**
 * @file popup/ConfirmDialog.ts
 *
 * A small in-popup confirmation modal, used to gate destructive actions that
 * cannot be undone (discarding a live recording). The popup cannot rely on
 * `window.confirm`: a native dialog steals focus from the extension popup, which
 * closes the popup on some platforms and leaves the caller with no answer.
 *
 * The component owns its own DOM subtree — it is appended to the host document
 * on first use and never enters PopupElements — so it stays independently
 * testable and reusable by any popup action that needs a yes/no answer.
 */

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** `danger` paints the confirm button with the destructive accent. */
  tone?: 'danger' | 'default';
};

type DialogParts = {
  overlay: HTMLElement;
  card: HTMLElement;
  title: HTMLElement;
  message: HTMLElement;
  confirmBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
};

export class ConfirmDialog {
  private parts: DialogParts | null = null;
  private pending: { promise: Promise<boolean>; settle: (answer: boolean) => void } | null = null;
  /** Focus owner at open time, restored when the dialog closes. */
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly doc: Document = document) {}

  /** True while the dialog is on screen and waiting for an answer. */
  isOpen = (): boolean => this.pending !== null;

  /**
   * Shows the dialog and resolves with the user's answer: `true` only for an
   * explicit confirm, `false` for cancel, Escape, a backdrop click, or a
   * programmatic `dismiss()`. Re-asking while a dialog is open returns the
   * in-flight answer instead of stacking a second modal.
   */
  ask(options: ConfirmDialogOptions): Promise<boolean> {
    if (this.pending) return this.pending.promise;

    const parts = this.parts ?? (this.parts = this.build());
    parts.title.textContent = options.title;
    parts.message.textContent = options.message;
    parts.confirmBtn.textContent = options.confirmLabel;
    parts.cancelBtn.textContent = options.cancelLabel;
    parts.confirmBtn.className = `btn ${options.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`;

    const active = this.doc.activeElement;
    this.previousFocus = active instanceof HTMLElement ? active : null;

    let settle!: (answer: boolean) => void;
    const promise = new Promise<boolean>((resolve) => { settle = resolve; });
    this.pending = { promise, settle };

    parts.overlay.hidden = false;
    // Cancel is the safe default for a destructive prompt: an accidental Enter
    // or Space on an already-focused dialog must not delete the recording.
    parts.cancelBtn.focus();

    return promise;
  }

  /** Updates the visible explanatory copy without closing an active prompt. */
  updateMessage(message: string): void {
    if (this.pending && this.parts) this.parts.message.textContent = message;
  }

  /** Closes an open dialog and resolves its pending `ask` with `false`. */
  dismiss = (): void => this.close(false);

  /** Removes the dialog's DOM and cancels any pending answer. */
  dispose(): void {
    this.close(false);
    this.parts?.overlay.remove();
    this.parts = null;
  }

  private close(answer: boolean): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    if (this.parts) this.parts.overlay.hidden = true;
    this.previousFocus?.focus();
    this.previousFocus = null;
    pending.settle(answer);
  }

  private build(): DialogParts {
    const overlay = this.doc.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;

    const card = this.doc.createElement('div');
    card.className = 'modal-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'modal-title');
    card.setAttribute('aria-describedby', 'modal-message');

    const title = this.doc.createElement('h2');
    title.className = 'modal-title';
    title.id = 'modal-title';

    const message = this.doc.createElement('p');
    message.className = 'modal-message';
    message.id = 'modal-message';

    const icon = this.doc.createElement('span');
    icon.className = 'modal-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 22 22" fill="none"><path d="M4 6h14M8.6 6V4.6a1.3 1.3 0 011.3-1.3h2.2a1.3 1.3 0 011.3 1.3V6M6.6 6l.7 11.2a1.3 1.3 0 001.3 1.2h4.8a1.3 1.3 0 001.3-1.2L15.4 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const actions = this.doc.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = this.doc.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.dataset.confirmCancel = '';

    const confirmBtn = this.doc.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-danger';
    confirmBtn.dataset.confirmAccept = '';

    cancelBtn.addEventListener('click', () => this.close(false));
    confirmBtn.addEventListener('click', () => this.close(true));
    // A click on the scrim (never on the card itself) reads as "get me out".
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) this.close(false);
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close(false);
        return;
      }
      if (event.key === 'Tab') this.trapFocus(event, cancelBtn, confirmBtn);
    });

    // The destructive action comes first visually; focus still opens on Keep.
    actions.append(confirmBtn, cancelBtn);
    card.append(icon, title, message, actions);
    overlay.append(card);
    this.doc.body.appendChild(overlay);

    return { overlay, card, title, message, confirmBtn, cancelBtn };
  }

  /** Keeps Tab cycling between the dialog's only two focusable controls. */
  private trapFocus(event: KeyboardEvent, first: HTMLElement, last: HTMLElement): void {
    const active = this.doc.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
