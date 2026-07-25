import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, tokens } from "./api";
import { formatDateTime } from "./datetime";

interface AppSettings {
  timezone: string;
}

// The admin-configured app settings (currently just the display timezone).
// Cached app-wide by react-query; only fetched once authenticated so the login
// page doesn't 401. Dates fall back to the browser's zone until this loads.
export function useSettings() {
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<AppSettings>("/settings")).data,
    enabled: !!tokens.access,
    staleTime: 5 * 60 * 1000,
  });
  return { timezone: data?.timezone };
}

// A date formatter bound to the configured timezone. Use everywhere a timestamp
// is shown so the whole UI reads in one zone.
export function useFormatDateTime() {
  const { timezone } = useSettings();
  return useCallback((value?: string | null) => formatDateTime(value, timezone), [timezone]);
}
