import React, { useRef, useState } from 'react';
import { DialogSheet } from '../components/ui/DialogSheet';
import type { DialogRequest, DialogResult } from '../store/useDialogStore';

/**
 * Local twin of lib/confirm.ts, for components that are themselves rendered
 * inside a <Modal>. The global <DialogHost /> can't serve those: two
 * sibling root-level Modals conflict on iOS, and the dialog ends up behind the
 * modal that raised it. Rendering the returned `dialog` inside the parent
 * modal's own tree stacks correctly instead.
 *
 * Everywhere else, prefer confirmAction/notify from lib/confirm.ts.
 */
export function useConfirm() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [seq, setSeq] = useState(0);
  const resolverRef = useRef<((value: DialogResult) => void) | null>(null);

  const open = (next: DialogRequest): Promise<DialogResult> => {
    resolverRef.current?.(next.kind === 'confirm' ? false : null);
    setRequest(next);
    setSeq((n) => n + 1);
    return new Promise<DialogResult>((resolve) => {
      resolverRef.current = resolve;
    });
  };

  const close = (value: DialogResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  };

  const confirm = async (options: {
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    destructive?: boolean;
  }): Promise<boolean> => {
    const result = await open({
      kind: 'confirm',
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      tone: options.destructive ? 'danger' : 'default',
    });
    return result === true;
  };

  const alert = (title: string, message?: string, destructive = false) => {
    void open({ kind: 'alert', title, message, tone: destructive ? 'danger' : 'default' });
  };

  const dialog = <DialogSheet key={seq} request={request} onClose={close} />;

  return { confirm, alert, dialog };
}
