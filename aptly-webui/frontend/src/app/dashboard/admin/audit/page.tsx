"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProtectedRoute } from "@/components/protected-route";
import { Loader2, Database, Camera, Globe, User, Shield, Package } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  username: string;
  action: string;
  resource_type: "mirror" | "snapshot" | "publish" | "user" | "system";
  resource_id: string;
  details: string;
  ip_address: string;
  success: boolean;
}

// Mock audit log data
const mockAuditLog: AuditLogEntry[] = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    user_id: "1",
    username: "admin",
    action: "mirror.create",
    resource_type: "mirror",
    resource_id: "ubuntu-jammy",
    details: "Created mirror 'ubuntu-jammy' from http://archive.ubuntu.com/ubuntu",
    ip_address: "192.168.1.100",
    success: true,
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    user_id: "1",
    username: "admin",
    action: "mirror.update",
    resource_type: "mirror",
    resource_id: "ubuntu-jammy",
    details: "Updated mirror packages",
    ip_address: "192.168.1.100",
    success: true,
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    user_id: "2",
    username: "operator",
    action: "snapshot.create",
    resource_type: "snapshot",
    resource_id: "ubuntu-jammy-2024-01-15",
    details: "Created snapshot from mirror ubuntu-jammy",
    ip_address: "192.168.1.101",
    success: true,
  },
  {
    id: "4",
    timestamp: new Date(Date.now() - 90000000).toISOString(),
    user_id: "1",
    username: "admin",
    action: "publish.create",
    resource_type: "publish",
    resource_id: "production/jammy",
    details: "Published snapshot ubuntu-jammy-2024-01-15",
    ip_address: "192.168.1.100",
    success: true,
  },
  {
    id: "5",
    timestamp: new Date(Date.now() - 172800000).toISOString(),
    user_id: "3",
    username: "viewer",
    action: "user.login",
    resource_type: "system",
    resource_id: "auth",
    details: "User login successful",
    ip_address: "192.168.1.102",
    success: true,
  },
];

const auditApi = {
  list: async (): Promise<AuditLogEntry[]> => {
    return mockAuditLog;
  },
};

export default function AuditLogPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AuditLogContent />
    </ProtectedRoute>
  );
}

function AuditLogContent() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: auditApi.list,
  });

  const getResourceIcon = (type: string) => {
    switch (type) {
      case "mirror":
        return <Database className="h-4 w-4" />;
      case "snapshot":
        return <Camera className="h-4 w-4" />;
      case "publish":
        return <Globe className="h-4 w-4" />;
      case "user":
        return <User className="h-4 w-4" />;
      case "system":
        return <Shield className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getActionBadge = (action: string, success: boolean) => {
    const baseClass = success ? "" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";

    if (action.includes(".create")) {
      return <Badge className={baseClass || "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"}>CREATE</Badge>;
    }
    if (action.includes(".update")) {
      return <Badge className={baseClass || "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"}>UPDATE</Badge>;
    }
    if (action.includes(".delete")) {
      return <Badge variant="destructive">DELETE</Badge>;
    }
    if (action.includes(".login")) {
      return <Badge variant="outline">LOGIN</Badge>;
    }
    return <Badge>{action.split(".")[1]?.toUpperCase() || action}</Badge>;
  };

  const filteredLogs =
    logs?.filter((log) => {
      const matchesSearch =
        log.username.toLowerCase().includes(search.toLowerCase()) ||
        log.action.toLowerCase().includes(search.toLowerCase()) ||
        log.details.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === "all" || log.resource_type === filterType;
      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "success" && log.success) ||
        (filterStatus === "failure" && !log.success);
      return matchesSearch && matchesType && matchesStatus;
    }) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Track all actions performed in the system
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Input
          placeholder="Search audit log..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mirror">Mirror</SelectItem>
              <SelectItem value="snapshot">Snapshot</SelectItem>
              <SelectItem value="publish">Publish</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <p className="text-muted-foreground">No audit log entries found</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{log.username}</div>
                      <div className="text-xs text-muted-foreground">ID: {log.user_id}</div>
                    </TableCell>
                    <TableCell>{getActionBadge(log.action, log.success)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getResourceIcon(log.resource_type)}
                        <span className="capitalize">{log.resource_type}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.resource_id}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={log.details}>
                      {log.details}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{log.ip_address}</TableCell>
                    <TableCell>
                      {log.success ? (
                        <Badge variant="default" className="bg-green-500">Success</Badge>
                      ) : (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
