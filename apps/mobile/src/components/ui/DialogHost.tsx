import React from 'react';
import { DialogSheet } from './DialogSheet';
import { useDialogStore } from '../../store/useDialogStore';

/**
 * Renders whatever confirmAction/notify/promptAction/chooseAction raised.
 * Mounted once, at the root — see app/_layout.tsx.
 *
 * Confirms raised from inside an already-open Modal must NOT use this: two
 * sibling root-level Modals fight on iOS. Those call useConfirm() instead and
 * render its sheet inside their own Modal tree.
 */
export const DialogHost: React.FC = () => {
  const request = useDialogStore((s) => s.request);
  const seq = useDialogStore((s) => s.seq);
  const close = useDialogStore((s) => s.close);

  // Keyed so a prompt's text box starts empty on every new request.
  return <DialogSheet key={seq} request={request} onClose={close} />;
};
