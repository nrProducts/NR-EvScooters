import { useEffect, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface DocumentPreview {
  url: string;
  title: string;
}

/** Signed URLs keep the original file extension before the query string, so it's a reliable type hint. */
function isPdfUrl(url: string): boolean {
  return url.split("?")[0].toLowerCase().endsWith(".pdf");
}

/** A signed document image (or PDF) in a large dialog, with rotate controls for sideways phone photos. */
export function DocumentPreviewDialog({
  preview,
  onClose,
}: {
  preview: DocumentPreview | null;
  onClose: () => void;
}) {
  const [rotation, setRotation] = useState(0);

  // A new document always opens upright.
  useEffect(() => setRotation(0), [preview?.url]);

  return (
    <Dialog open={!!preview} onOpenChange={(o) => { if (!o) { onClose(); setRotation(0); } }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="capitalize">{preview?.title}</DialogTitle>
        </DialogHeader>
        {preview && (
          <div className="space-y-2">
            {isPdfUrl(preview.url) ? (
              <iframe
                src={preview.url}
                title={preview.title}
                className="h-[75vh] w-full rounded-md border border-border bg-muted"
              />
            ) : (
              <>
                <div className="flex justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRotation((r) => r - 90)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Rotate left
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRotation((r) => r + 90)}>
                    <RotateCw className="h-3.5 w-3.5" /> Rotate right
                  </Button>
                </div>
                <div className="flex h-[75vh] items-center justify-center overflow-auto rounded-md border border-border bg-muted">
                  <img
                    src={preview.url}
                    alt={preview.title}
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      ...(rotation % 180 !== 0 ? { maxHeight: "75%", maxWidth: "75%" } : {}),
                    }}
                  />
                </div>
              </>
            )}
            <div className="flex justify-end">
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Open in new tab
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
