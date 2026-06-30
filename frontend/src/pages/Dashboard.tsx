import { useQuery } from "@tanstack/react-query";
import { Database, FolderGit2, Camera, UploadCloud, Activity } from "lucide-react";
import { api } from "../lib/api";
import { Card, PageHeader, Spinner, Badge } from "../components/ui";

interface Summary {
  mirrors: number;
  repos: number;
  snapshots: number;
  published: number;
}

const CARDS = [
  { key: "mirrors", label: "Mirrors", icon: Database, color: "text-brand-400" },
  { key: "repos", label: "Local Repos", icon: FolderGit2, color: "text-emerald-400" },
  { key: "snapshots", label: "Snapshots", icon: Camera, color: "text-amber-400" },
  { key: "published", label: "Published", icon: UploadCloud, color: "text-purple-400" },
] as const;

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ["summary"],
    queryFn: async () => (await api.get<Summary>("/system/summary")).data,
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get("/tasks")).data as any[],
    refetchInterval: 5000,
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your aptly repository server" />
      {summary.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {CARDS.map((c) => (
            <Card key={c.key} className="p-5">
              <div className="flex items-center justify-between">
                <c.icon className={c.color} size={22} />
                <span className="text-3xl font-semibold">{(summary.data as any)?.[c.key] ?? 0}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{c.label}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Card>
          <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-3">
            <Activity size={16} className="text-slate-400" />
            <h2 className="text-sm font-semibold">Active aptly tasks</h2>
          </div>
          <div className="p-5">
            {!tasks.data || tasks.data.length === 0 ? (
              <p className="text-sm text-slate-500">No background tasks running.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.data.map((t) => (
                  <li key={t.ID} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{t.Name || `Task ${t.ID}`}</span>
                    <Badge color={t.State === 2 ? "green" : t.State === 3 ? "red" : "amber"}>
                      {t.State === 2 ? "succeeded" : t.State === 3 ? "failed" : "running"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
