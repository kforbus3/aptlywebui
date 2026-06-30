import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { api } from "../lib/api";
import {
  Card, Input, Label, Table, Badge, Spinner, EmptyState, PageHeader,
} from "../components/ui";

interface AuditEntry {
  id: number;
  timestamp: string;
  username: string;
  action: string;
  resource: string;
  method: string;
  status: string;
  detail: string;
}

export default function Audit() {
  const [username, setUsername] = useState("");
  const [action, setAction] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit", username, action],
    queryFn: async () =>
      (await api.get<AuditEntry[]>("/audit", {
        params: { limit: 200, username: username || undefined, action: action || undefined },
      })).data,
  });

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Recent actions across the system" />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div><Label>Filter by user</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" /></div>
          <div><Label>Filter by action</Label><Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="action" /></div>
        </div>
      </Card>
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={<ScrollText size={32} />} title="No audit entries" />
        ) : (
          <Table head={["Time", "User", "Action", "Resource", "Status"]}>
            {data.map((e) => (
              <tr key={e.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-400">{e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}</td>
                <td className="px-4 py-3 text-slate-200">{e.username}</td>
                <td className="px-4 py-3 text-slate-400">{e.action}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{e.resource}</td>
                <td className="px-4 py-3"><Badge color={e.status === "success" ? "green" : "red"}>{e.status}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
