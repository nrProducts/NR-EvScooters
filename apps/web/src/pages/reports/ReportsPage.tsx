import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartCard } from "@/components/common/ChartCard";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { Skeleton } from "@/components/ui/skeleton";

const REPORTS = [
  { key: "daily", label: "Daily Report" },
  { key: "weekly", label: "Weekly Report" },
  { key: "monthly", label: "Monthly Report" },
  { key: "fleet", label: "Fleet Utilization" },
  { key: "revenue", label: "Revenue" },
  { key: "growth", label: "Rider Growth" },
  { key: "performance", label: "Vehicle Performance" },
  { key: "battery", label: "Battery Health" },
  { key: "maintenance", label: "Maintenance Cost" },
] as const;

export default function ReportsPage() {
  const [tab, setTab] = useState<(typeof REPORTS)[number]["key"]>("fleet");
  const { data: summary, isLoading } = useDashboardSummary();

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Download or review operational and financial reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><FileText className="h-4 w-4" /> PDF</Button>
          <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button variant="outline" size="sm"><FileDown className="h-4 w-4" /> CSV</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="flex-wrap">
          {REPORTS.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab}>
          {isLoading || !summary ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Fleet Utilization">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={summary.fleetUtilization}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                    <Tooltip />
                    <Line type="monotone" dataKey="utilization" stroke="hsl(217 91% 48%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Revenue Trend">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary.revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip />
                    <Bar dataKey="revenue" fill="hsl(152 60% 36%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Most / least used vehicles</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Most used</p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between"><span>TN09AB1004</span><span>312 rides</span></li>
                  <li className="flex justify-between"><span>TN09AB1012</span><span>288 rides</span></li>
                  <li className="flex justify-between"><span>TN09AB1027</span><span>265 rides</span></li>
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Least used</p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex justify-between"><span>TN09AB1039</span><span>14 rides</span></li>
                  <li className="flex justify-between"><span>TN09AB1041</span><span>19 rides</span></li>
                  <li className="flex justify-between"><span>TN09AB1008</span><span>22 rides</span></li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
