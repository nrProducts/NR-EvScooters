import { AnimatePresence } from "framer-motion";
import { useToastStore } from "@/store/toastStore";
import { Toast } from "./Toast";

/** Single mount point for every toast in the app — rendered once by RealtimeProvider. */
export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2.5">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
