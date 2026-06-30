import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { api } from "../lib/api";
import {
  Card, Input, Label, Select, Table, Spinner, EmptyState, PageHeader,
} from "../components/ui";

type SourceType = "repos" | "snapshots" | "mirrors";

const SOURCE_LABELS: Record<SourceType, string> = {
  repos: "Local Repo",
  snapshots: "Snapshot",
  mirrors: "Mirror",
};

interface ParsedKey {
  name: string;
  version: string;
  arch: string;
  raw: string;
}

function parseKey(key: string): ParsedKey {
  // keys look like "P<arch> <name> <version> <hash>"
  const parts = key.split(/\s+/);
  if (parts.length >= 3 && parts[0].startsWith("P")) {
    return { arch: parts[0].slice(1), name: parts[1], version: parts[2], raw: key };
  }
  return { name: key, version: "", arch: "", raw: key };
}

export default function Packages() {
  const [sourceType, setSourceType] = useState<SourceType>("repos");
  const [source, setSource] = useState("");
  const [filter, setFilter] = useState("");

  const sources = useQuery({
    queryKey: [sourceType],
    queryFn: async () => (await api.get<{ Name: string }[]>(`/${sourceType}`)).data,
  });

  const packages = useQuery({
    queryKey: ["packages", sourceType, source],
    queryFn: async () => (await api.get<string[]>(`/${sourceType}/${source}/packages`)).data,
    enabled: !!source,
  });

  const parsed = (packages.data || []).map(parseKey);
  const filtered = parsed.filter((p) => p.raw.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <PageHeader title="Packages" subtitle="Browse packages within a single source" />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label>Source Type</Label>
            <Select value={sourceType} onChange={(e) => { setSourceType(e.target.value as SourceType); setSource(""); }}>
              {(Object.keys(SOURCE_LABELS) as SourceType[]).map((k) => (
                <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Source</Label>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Select…</option>
              {(sources.data || []).map((s) => <option key={s.Name} value={s.Name}>{s.Name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Filter</Label>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter packages…" />
          </div>
        </div>
      </Card>
      <Card>
        {!source ? (
          <EmptyState icon={<Package size={32} />} title="Pick a source" hint="Select a source type and name to browse its packages." />
        ) : packages.isLoading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package size={32} />} title="No packages" hint="No packages match your filter." />
        ) : (
          <>
            <div className="border-b border-slate-800 px-4 py-2 text-xs text-slate-500">{filtered.length} package(s)</div>
            <Table head={["Name", "Version", "Architecture"]}>
              {filtered.map((p) => (
                <tr key={p.raw} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-slate-200">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{p.version || "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{p.arch || "—"}</td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
