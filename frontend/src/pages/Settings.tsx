import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Save } from "lucide-react";
import { api, apiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { formatDateTime } from "../lib/datetime";
import { Button, Card, Label, Select, PageHeader, Spinner } from "../components/ui";

export default function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tz, setTz] = useState("");

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<{ timezone: string }>("/settings")).data,
  });
  const zones = useQuery({
    queryKey: ["timezones"],
    queryFn: async () => (await api.get<{ timezones: string[] }>("/settings/timezones")).data.timezones,
    staleTime: Infinity,
  });

  // Seed the picker with the saved value once it loads.
  useEffect(() => {
    if (settings.data?.timezone && !tz) setTz(settings.data.timezone);
  }, [settings.data, tz]);

  const save = useMutation({
    mutationFn: () => api.put("/settings", { timezone: tz }),
    onSuccess: () => {
      toast.success("Timezone saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(apiError(e)),
  });

  const dirty = !!tz && tz !== settings.data?.timezone;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Application-wide preferences" />
      <Card>
        {settings.isLoading || zones.isLoading ? (
          <Spinner />
        ) : (
          <div className="max-w-xl space-y-4 p-1">
            <div>
              <Label>Timezone</Label>
              <Select value={tz} onChange={(e) => setTz(e.target.value)}>
                {(zones.data || []).map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-500">
                Used for scheduled-job times, dated snapshot names, and every date shown in the UI.
                Changing it reschedules existing jobs immediately.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
              <Clock size={15} className="text-slate-400" />
              Current time here:&nbsp;
              <span className="font-medium text-slate-100">
                {tz ? formatDateTime(new Date().toISOString(), tz) : "—"}
              </span>
            </div>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              <Save size={15} /> Save
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
