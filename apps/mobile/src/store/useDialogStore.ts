import { create } from 'zustand';

export type DialogTone = 'default' | 'danger' | 'success';

interface DialogBase {
    title: string;
    message?: string;
    tone?: DialogTone;
}

export interface AlertRequest extends DialogBase {
    kind: 'alert';
    confirmLabel?: string;
}

export interface ConfirmRequest extends DialogBase {
    kind: 'confirm';
    confirmLabel: string;
    cancelLabel?: string;
}

export interface PromptRequest extends DialogBase {
    kind: 'prompt';
    confirmLabel: string;
    cancelLabel?: string;
    placeholder?: string;
    multiline?: boolean;
    /** Return an error string to keep the sheet open, or null to accept. */
    validate?: (value: string) => string | null;
}

export interface ActionsRequest extends DialogBase {
    kind: 'actions';
    options: { key: string; label: string; tone?: DialogTone }[];
    cancelLabel?: string;
}

export type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest | ActionsRequest;

/** false / null means dismissed; a prompt resolves its text, actions their key. */
export type DialogResult = boolean | string | null;

interface DialogState {
    request: DialogRequest | null;
    /** Bumped per request so the sheet remounts with fresh input state. */
    seq: number;
    resolver: ((value: DialogResult) => void) | null;

    open: (request: DialogRequest) => Promise<DialogResult>;
    close: (value: DialogResult) => void;
}

/**
 * Backs the themed replacement for Alert.alert. It lives in a store rather
 * than in component state because confirm/notify are called from hooks and
 * stores too, not just from screens — the same reason Alert.alert is a static
 * method. <DialogHost /> renders whatever is here.
 */
export const useDialogStore = create<DialogState>((set, get) => ({
    request: null,
    seq: 0,
    resolver: null,

    open: (request) => {
        // A second dialog raised while one is up replaces it; the first
        // resolves as dismissed so its caller never hangs.
        const previous = get().resolver;
        if (previous) previous(request.kind === 'confirm' ? false : null);

        return new Promise<DialogResult>((resolve) => {
            set((s) => ({ request, seq: s.seq + 1, resolver: resolve }));
        });
    },

    close: (value) => {
        const { resolver } = get();
        set({ request: null, resolver: null });
        resolver?.(value);
    },
}));
