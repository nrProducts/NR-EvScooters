import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useToastStore } from "@/store/toastStore";
import { cn } from "@/lib/utils";

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable (plain-http hosts). */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

/**
 * A small copy icon to put beside a value (a VIN, a plate). Grid rows open on
 * click/double-click and are not text-selectable, so this is how a value gets
 * out of a row: one click copies it and the icon turns into a tick for a
 * moment. Clicks stop here, so copying never opens the row underneath.
 */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const push = useToastStore((s) => s.push);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await copyText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      push({ tone: "warning", title: "Copy blocked", message: `Your browser blocked copying the ${label}.` });
    }
  };

  return (
    <IconButton
      type="button"
      variant="ghost"
      label={copied ? "Copied" : `Copy ${label}`}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cn(
        "h-6 w-6 shrink-0 rounded-md text-muted-foreground/70 hover:text-foreground",
        copied && "text-primary hover:text-primary",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </IconButton>
  );
}
