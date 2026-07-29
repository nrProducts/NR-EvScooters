import { useDialogStore, type DialogTone } from '../store/useDialogStore';

/**
 * The app's confirmation / warning dialogs. These used to wrap Alert.alert,
 * which looks like neither platform's idea of this app and is a total no-op on
 * react-native-web (`static alert() {}`). They now raise a themed bottom sheet
 * through useDialogStore, rendered by <DialogHost /> at the root.
 *
 * Still imperative and still awaitable, so hooks and stores can call them —
 * that was the useful part of Alert.alert. Signatures are unchanged from the
 * Alert-backed version.
 *
 * Calling these from inside an already-open Modal will not work on iOS (two
 * sibling root Modals). Use the useConfirm() hook there instead.
 */

interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
}

/** Resolves true if the user confirmed, false if they cancelled/dismissed. */
export async function confirmAction(options: ConfirmOptions): Promise<boolean> {
    const result = await useDialogStore.getState().open({
        kind: 'confirm',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        tone: options.destructive ? 'danger' : 'default',
    });
    return result === true;
}

/** A dismiss-only message. Fire-and-forget, like Alert.alert was. */
export function notify(title: string, message?: string, tone: DialogTone = 'default'): void {
    void useDialogStore.getState().open({ kind: 'alert', title, message, tone });
}

/** Same as notify(), styled as a failure. */
export function notifyError(title: string, message?: string): void {
    notify(title, message, 'danger');
}

/** Same as notify(), styled as a success. */
export function notifySuccess(title: string, message?: string): void {
    notify(title, message, 'success');
}

interface PromptOptions {
    title: string;
    message?: string;
    confirmLabel: string;
    cancelLabel?: string;
    placeholder?: string;
    multiline?: boolean;
    destructive?: boolean;
    /** Return an error to keep the sheet open, or null to accept. */
    validate?: (value: string) => string | null;
}

/**
 * Asks for a line of text. Replaces Alert.prompt, which is iOS-only and
 * therefore always needed a second Android code path.
 * Resolves the trimmed text, or null if cancelled.
 */
export async function promptAction(options: PromptOptions): Promise<string | null> {
    const result = await useDialogStore.getState().open({
        kind: 'prompt',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
        placeholder: options.placeholder,
        multiline: options.multiline,
        validate: options.validate,
        tone: options.destructive ? 'danger' : 'default',
    });
    return typeof result === 'string' ? result : null;
}

interface ChooseOptions {
    title: string;
    message?: string;
    options: { key: string; label: string; destructive?: boolean }[];
    cancelLabel?: string;
}

/** An action sheet. Resolves the chosen option's key, or null if cancelled. */
export async function chooseAction(options: ChooseOptions): Promise<string | null> {
    const result = await useDialogStore.getState().open({
        kind: 'actions',
        title: options.title,
        message: options.message,
        cancelLabel: options.cancelLabel,
        options: options.options.map((o) => ({
            key: o.key,
            label: o.label,
            tone: o.destructive ? ('danger' as const) : ('default' as const),
        })),
    });
    return typeof result === 'string' ? result : null;
}
