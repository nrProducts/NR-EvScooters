import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/common/Spinner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useCommitVehicleImport, usePreviewVehicleImport } from "@/hooks/useVehicles";
import { downloadVehicleImportTemplate, type VehicleImportPreview } from "@/services/api/vehicles";
import { ApiError } from "@/services/api/httpClient";
import { toastError, toastSuccess } from "@/lib/toastHelpers";

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

/**
 * Add many vehicles from one spreadsheet.
 *
 * 1. Download the template (live model names and hub codes as dropdowns).
 * 2. Upload it — the server checks every row against the same rules as
 *    "Add vehicle", plus duplicates in the file and in the fleet. Nothing is
 *    saved yet.
 * 3. Review each row, confirm, and the valid rows are saved together.
 */
export function BulkImportVehiclesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<VehicleImportPreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const previewImport = usePreviewVehicleImport();
  const commitImport = useCommitVehicleImport();

  const validRows = preview?.rows.filter((r) => r.errors.length === 0) ?? [];

  const reset = () => {
    setFile(null);
    setPreview(null);
    previewImport.reset();
    commitImport.reset();
    if (fileInput.current) fileInput.current.value = "";
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadVehicleImportTemplate();
    } catch (err) {
      toastError(err, "Could not download the template");
    } finally {
      setDownloading(false);
    }
  };

  const checkFile = () => {
    if (!file) return;
    previewImport.mutate(file, { onSuccess: setPreview });
  };

  const runImport = () => {
    commitImport.mutate(validRows, {
      onSuccess: (result) => {
        setConfirmOpen(false);
        toastSuccess(`${result.created} vehicle${result.created === 1 ? "" : "s"} added`);
        close(false);
      },
      onError: () => setConfirmOpen(false),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bulk import vehicles</DialogTitle>
            <DialogDescription>
              {preview
                ? "Check every row below. Nothing has been saved yet."
                : "Fill in the template in Excel, then upload it. You'll review every row before anything is saved."}
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">1. Download the template</p>
                  <p className="text-xs text-muted-foreground">
                    One vehicle per row. Model and hub code are dropdowns. Up to 500 vehicles per file.
                  </p>
                </div>
                <Button variant="outline" onClick={() => void downloadTemplate()} disabled={downloading}>
                  {downloading ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  Download template
                </Button>
              </div>

              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">2. Upload the filled-in file</p>
                  <p className="text-xs text-muted-foreground">Excel .xlsx only.</p>
                </div>
                <input
                  ref={fileInput}
                  id="vehicle-import-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    previewImport.reset();
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full items-center gap-3 rounded-md border border-dashed border-border px-4 py-5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileSpreadsheet className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 text-sm">
                    {file ? (
                      <span className="block truncate font-medium">{file.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Choose a file…</span>
                    )}
                  </span>
                </button>
              </div>

              {previewImport.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {errorText(previewImport.error)}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{preview.total} row{preview.total === 1 ? "" : "s"}</span>
                <Badge variant="success">{preview.valid} ready</Badge>
                {preview.invalid > 0 && <Badge variant="destructive">{preview.invalid} with errors</Badge>}
                {file && <span className="truncate text-xs text-muted-foreground">from {file.name}</span>}
              </div>

              {preview.invalid > 0 && (
                <div className="flex gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {preview.valid > 0
                      ? `${preview.invalid} row${preview.invalid === 1 ? " has" : "s have"} errors and will be skipped. Fix ${preview.invalid === 1 ? "it" : "them"} in the file and upload again to include ${preview.invalid === 1 ? "it" : "them"}.`
                      : "No rows can be imported yet. Fix the errors in the file and upload it again."}
                  </p>
                </div>
              )}

              <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Registration</th>
                      <th className="px-3 py-2 font-medium">VIN</th>
                      <th className="px-3 py-2 font-medium">Model</th>
                      <th className="px-3 py-2 font-medium">Hub</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr key={r.row} className="border-t border-border align-top">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row}</td>
                        <td className="px-3 py-2 font-medium">{r.registration_number ?? "—"}</td>
                        <td className="px-3 py-2">{r.vin ?? "—"}</td>
                        <td className="px-3 py-2">{r.model ?? "—"}</td>
                        <td className="px-3 py-2">{r.hub_code ?? "—"}</td>
                        <td className="px-3 py-2">
                          {r.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                            </span>
                          ) : (
                            <ul className="space-y-0.5 text-destructive">
                              {r.errors.map((e) => <li key={e}>{e}</li>)}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {commitImport.error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {errorText(commitImport.error)}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {!preview ? (
              <>
                <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
                <Button onClick={checkFile} disabled={!file || previewImport.isPending}>
                  {previewImport.isPending ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  Check file
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={reset}>Choose another file</Button>
                <Button onClick={() => setConfirmOpen(true)} disabled={validRows.length === 0}>
                  Import {validRows.length} vehicle{validRows.length === 1 ? "" : "s"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Add ${validRows.length} vehicle${validRows.length === 1 ? "" : "s"} to the fleet?`}
        description={
          preview && preview.invalid > 0
            ? `${preview.invalid} row${preview.invalid === 1 ? "" : "s"} with errors will be skipped. The vehicles are saved together, and each one starts as Available.`
            : "The vehicles are saved together, and each one starts as Available."
        }
        confirmLabel={`Add ${validRows.length} vehicle${validRows.length === 1 ? "" : "s"}`}
        loading={commitImport.isPending}
        onConfirm={runImport}
      />
    </>
  );
}
