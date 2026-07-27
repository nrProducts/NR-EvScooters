import { useState } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SideDrawer } from "@/components/common/SideDrawer";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

interface SupportTicket {
  id: string;
  riderName: string;
  subject: string;
  status: "open" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  createdOn: string;
}

// Local mock data — this module isn't in the shared mock service yet since
// the backend has no /support endpoints wired up for staff/admin use.
const TICKETS: SupportTicket[] = [
  { id: "t1", riderName: "Arun Kumar", subject: "Battery swap station was closed", status: "open", priority: "medium", createdOn: new Date().toISOString() },
  { id: "t2", riderName: "Divya Raj", subject: "Wallet refund not received", status: "in_progress", priority: "high", createdOn: new Date().toISOString() },
  { id: "t3", riderName: "Suresh Iyer", subject: "Vehicle handover delay", status: "completed", priority: "low", createdOn: new Date().toISOString() },
];

const TABS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Resolved" },
] as const;

export default function SupportTicketsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("all");
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState("");

  const filtered = tab === "all" ? TICKETS : TICKETS.filter((t) => t.status === tab);

  const columns: DataTableColumn<SupportTicket>[] = [
    { header: "Rider", key: "rider", render: (t) => t.riderName },
    { header: "Subject", key: "subject", render: (t) => t.subject },
    { header: "Priority", key: "priority", render: (t) => <StatusBadge status={t.priority} />, hideOnMobile: true },
    { header: "Status", key: "status", render: (t) => <StatusBadge status={t.status} /> },
    { header: "Created", key: "created", render: (t) => formatDateTime(t.createdOn), hideOnMobile: true },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support Tickets</h1>
          <p className="text-sm text-muted-foreground">Rider issues awaiting a response</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            emptyTitle="No tickets in this queue"
            onRowClick={(t) => setSelected(t)}
          />
        </CardContent>
      </Card>

      <SideDrawer open={!!selected} onOpenChange={(o) => !o && setSelected(null)} title="Ticket detail">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{selected.riderName}</p>
              <StatusBadge status={selected.status} />
            </div>
            <p className="text-sm">{selected.subject}</p>
            <p className="text-xs text-muted-foreground">Created {formatDateTime(selected.createdOn)}</p>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Reply</p>
              <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a response..." />
            </div>
            <Button className="w-full" disabled={!reply}>
              <MessageCircle className="h-4 w-4" /> Send reply
            </Button>
          </div>
        )}
      </SideDrawer>
    </div>
  );
}
