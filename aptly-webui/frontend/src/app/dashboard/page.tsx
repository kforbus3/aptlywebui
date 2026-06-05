"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Camera,
  Globe,
  Package,
  AlertCircle,
  Activity,
  CheckCircle,
  Clock,
  RefreshCw,
  Plus,
  ArrowRight,
} from "lucide-react";
import { mirrors, snapshots, publish, tasks } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

interface ActivityItem {
  id: string;
  type: "mirror" | "snapshot" | "publish" | "system";
  action: string;
  target: string;
  timestamp: string;
  status: "success" | "pending" | "failed";
}

// Mock activity data - in production, this would come from an API
const mockActivity: ActivityItem[] = [
  {
    id: "1",
    type: "mirror",
    action: "Mirror created",
    target: "ubuntu-jammy",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    status: "success",
  },
  {
    id: "2",
    type: "snapshot",
    action: "Snapshot created",
    target: "ubuntu-jammy-2024-01-15",
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    status: "success",
  },
  {
    id: "3",
    type: "publish",
    action: "Published repository",
    target: "production/jammy",
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    status: "success",
  },
];

export default function DashboardPage() {
  const { data: mirrorsData, isLoading: mirrorsLoading } = useQuery({
    queryKey: ["mirrors"],
    queryFn: () => mirrors.list(),
  });

  const { data: snapshotsData, isLoading: snapshotsLoading } = useQuery({
    queryKey: ["snapshots"],
    queryFn: () => snapshots.list(),
  });

  const { data: publishData, isLoading: publishLoading } = useQuery({
    queryKey: ["publish"],
    queryFn: () => publish.list(),
  });

  const { data: tasksData } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasks.list(),
  });

  const mirrorCount = mirrorsData?.data?.length || 0;
  const snapshotCount = snapshotsData?.data?.length || 0;
  const publishCount = publishData?.data?.length || 0;
  const activeTasks =
    tasksData?.data?.filter((t: { State: number }) => t.State === 1).length || 0;

  const hasError =
    mirrorsData?.data?.error ||
    snapshotsData?.data?.error ||
    publishData?.data?.error;

  // Calculate health status
  const getHealthStatus = () => {
    if (hasError) return { status: "error", message: "Connection issue" };
    if (activeTasks > 0) return { status: "busy", message: "Tasks running" };
    return { status: "healthy", message: "All systems operational" };
  };

  const health = getHealthStatus();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your Aptly repository management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              health.status === "healthy"
                ? "default"
                : health.status === "busy"
                ? "secondary"
                : "destructive"
            }
            className="flex items-center gap-1"
          >
            {health.status === "healthy" ? (
              <CheckCircle className="h-3 w-3" />
            ) : health.status === "busy" ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {health.message}
          </Badge>
        </div>
      </div>

      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load some data from the Aptly API. Please check your
            configuration.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Mirrors"
          value={mirrorsLoading ? "..." : mirrorCount.toString()}
          description="External repositories"
          icon={Database}
          href="/dashboard/mirrors"
        />
        <StatCard
          title="Snapshots"
          value={snapshotsLoading ? "..." : snapshotCount.toString()}
          description="Frozen states"
          icon={Camera}
          href="/dashboard/snapshots"
        />
        <StatCard
          title="Published"
          value={publishLoading ? "..." : publishCount.toString()}
          description="Active publications"
          icon={Globe}
          href="/dashboard/publish"
        />
        <StatCard
          title="Active Tasks"
          value={activeTasks.toString()}
          description="Running operations"
          icon={Activity}
          href="/dashboard"
          trend={activeTasks > 0 ? "bg-blue-100 dark:bg-blue-900" : undefined}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Activity Feed */}
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your recent repository operations</CardDescription>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockActivity.length > 0 ? (
                mockActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          activity.status === "success"
                            ? "bg-green-500"
                            : activity.status === "pending"
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {activity.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.target}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(activity.timestamp)}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent activity to display
                </p>
              )}
            </div>          </CardContent>
        </Card>

        {/* Quick Actions + System Status */}
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/dashboard/mirrors">
                  <span className="flex items-center">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Mirror
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/dashboard/snapshots">
                  <span className="flex items-center">
                    <Camera className="mr-2 h-4 w-4" />
                    Create Snapshot
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/dashboard/publish">
                  <span className="flex items-center">
                    <Globe className="mr-2 h-4 w-4" />
                    Publish Repository
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/dashboard/search">
                  <span className="flex items-center">
                    <Package className="mr-2 h-4 w-4" />
                    Search Packages
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Current system health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>API Connection</span>
                  <span className="text-green-600">Connected</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Database</span>
                  <span className="text-green-600">Healthy</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Aptly Server</span>
                  <span className="text-green-600">Online</span>
                </div>
              </div>

              {activeTasks > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-medium">Active Tasks</p>
                  <Progress value={45} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {activeTasks} task{activeTasks !== 1 ? "s" : ""} running
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  icon: typeof Database;
  href?: string;
  trend?: string;
}) {
  const content = (
    <Card className={trend}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

function formatTimeAgo(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
