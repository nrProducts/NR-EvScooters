import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { useToastStore, type Toast as ToastData, type ToastTone } from "@/store/toastStore";
import { cn } from "@/lib/utils";

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const TONE_CLASSES: Record<ToastTone, string> = {
  success: "border-l-success text-success",
  warning: "border-l-warning text-warning",
  error: "border-l-destructive text-destructive",
  info: "border-l-info text-info",
};

export function Toast({ toast }: { toast: ToastData }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = TONE_ICON[toast.tone];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className={cn(
        "pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-l-4 bg-card p-3.5 shadow-card",
        TONE_CLASSES[toast.tone],
      )}
      role="status"
      onClick={() => {
        toast.onClick?.();
        dismiss(toast.id);
      }}
    >
      <div className={cn("flex items-start gap-2.5", toast.onClick && "cursor-pointer")}>
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_CLASSES[toast.tone])} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-card-foreground">{toast.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{toast.message}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss(toast.id);
          }}
          className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-smooth hover:bg-card-hover hover:text-card-foreground"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
