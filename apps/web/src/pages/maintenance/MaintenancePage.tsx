import { useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useMaintenanceTickets, useAssignTechnician, useUpdateTicketStatus, useCreateTicket } from "@/hooks/useMaintenance";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { MaintenanceStatus, MaintenanceTicket } from "@/types";

const TABS: { value: MaintenanceStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

const TECHNICIANS = ["Ganesh R", "Priya S", "Mohan V", "Arun K"];

export default function MaintenancePage() {
  const [status, setStatus] = useState<MaintenanceStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<MaintenanceTicket | null>(null);
  const [technician, setTechnician] = useState(TECHNICIANS[0]);

  const { data, isLoading, isError, refetch } = useMaintenanceTickets({ status, page, pageSize: 8 });
  const assignTechnician = useAssignTechnician();
  const updateStatus = useUpdateTicketStatus();
  const createTicket = useCreateTicket();

  const [form, setForm] = useState({ vehicleReg: "", issue: "", priority: "medium" as MaintenanceTicket["priority"] });

  const columns: DataTableColumn<MaintenanceTicket>[] = [
    {
      header: "Vehicle",
      key: "vehicle",
      render: (t) => <span className="font-medium">{t.vehicleReg}</span>,
    },
    { header: "Issue", key: "issue", render: (t) => t.issue },
    { header: "Priority", key: "priority", render: (t) => <StatusBadge status={t.priority} />, hideOnMobile: true },
    { header: "Status", key: "status", render: (t) => <StatusBadge status={t.status} /> },
    { header: "Technician", key: "tech", render: (t) => t.technician ?? "Unassigned", hideOnMobile: true },
    {
      header: "Cost",
      key: "cost",
      render: (t) => (t.repairCost ? formatCurrency(t.repairCost) : "—"),
      hideOnMobile: true,
    },
    {
      header: "Actions",
      key: "actions",
      render: (t) => (
        <div className="flex gap-2">
          {t.status === "open" && (
            <Button size="sm" variant="outline" onClick={() => setAssignTarget(t)}>
              <UserCog className="h-3.5 w-3.5" /> Assign
            </Button>
          )}
          {t.status === "in_progress" && (
            <Button size="sm" onClick={() => updateStatus.mutate({ id: t.id, status: "completed" })}>
              Mark complete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">Service requests, inspections and repairs</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New ticket
        </Button>
      </div>

      <Tabs value={status} onValueChange={(v) => { setStatus(v as MaintenanceStatus | "all"); setPage(1); }}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <DataTable
          columns={columns}
          data={data?.data ?? []}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
          emptyTitle="No maintenance tickets"
        />
        {data && <Pagination page={page} pageSize={8} total={data.total} onPageChange={setPage} />}
      </Card>

      {/* Assign technician dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign technician</DialogTitle>
            <DialogDescription>{assignTarget?.vehicleReg} — {assignTarget?.issue}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Technician</Label>
            <Select value={technician} onValueChange={setTechnician}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TECHNICIANS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button
              disabled={assignTechnician.isPending}
              onClick={() => {
                if (assignTarget) {
                  assignTechnician.mutate(
                    { id: assignTarget.id, technician },
                    { onSuccess: () => setAssignTarget(null) },
                  );
                }
              }}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create ticket dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report an issue</DialogTitle>
            <DialogDescription>Log a new maintenance ticket for a vehicle.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Vehicle registration</Label>
              <Input
                placeholder="TN09AB1234"
                value={form.vehicleReg}
                onChange={(e) => setForm((f) => ({ ...f, vehicleReg: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Issue description</Label>
              <Textarea
                rows={3}
                value={form.issue}
                onChange={(e) => setForm((f) => ({ ...f, issue: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v as MaintenanceTicket["priority"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.vehicleReg || !form.issue || createTicket.isPending}
              onClick={() => {
                createTicket.mutate(form, {
                  onSuccess: () => {
                    setCreateOpen(false);
                    setForm({ vehicleReg: "", issue: "", priority: "medium" });
                  },
                });
              }}
            >
              Create ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
