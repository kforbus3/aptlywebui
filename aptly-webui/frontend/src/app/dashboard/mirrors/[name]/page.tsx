"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { mirrors } from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Trash2,
  Package,
  Info,
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MirrorDetail {
  Name: string;
  ArchiveURL: string;
  Distribution: string;
  Components: string[];
  Architectures: string[];
  DownloadWithSources: boolean;
  DownloadUdebs: boolean;
  Filter?: string;
}

interface MirrorPackage {
  Name: string;
  Version: string;
  Architecture: string;
  Description?: string;
}

export default function MirrorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const mirrorName = decodeURIComponent(params.name as string);
  const [showDelete, setShowDelete] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: mirror, isLoading: mirrorLoading } = useQuery({
    queryKey: ["mirror", mirrorName],
    queryFn: () => mirrors.get(mirrorName),
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["mirror-packages", mirrorName],
    queryFn: () => mirrors.getPackages(mirrorName),
  });

  const deleteMutation = useMutation({
    mutationFn: () => mirrors.delete(mirrorName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mirrors"] });
      router.push("/dashboard/mirrors");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => mirrors.updatePackages(mirrorName, { force: false }),
    onMutate: () => {
      setIsUpdating(true);
      setUpdateProgress(0);
      // Simulate progress updates
      const interval = setInterval(() => {
        setUpdateProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 1000);
      return () => clearInterval(interval);
    },
    onSuccess: () => {
      setUpdateProgress(100);
      setTimeout(() => {
        setIsUpdating(false);
        setUpdateProgress(0);
        queryClient.invalidateQueries({ queryKey: ["mirror", mirrorName] });
        queryClient.invalidateQueries({
          queryKey: ["mirror-packages", mirrorName],
        });
      }, 500);
    },
    onError: () => {
      setIsUpdating(false);
      setUpdateProgress(0);
    },
  });

  const packages: MirrorPackage[] = packagesData?.data || [];

  if (mirrorLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mirrorData: MirrorDetail = mirror?.data;

  if (!mirrorData) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Mirror &quot;{mirrorName}&quot; not found.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href="/dashboard/mirrors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Mirrors
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard/mirrors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {mirrorData.Name}
          </h1>
          <p className="text-muted-foreground">{mirrorData.ArchiveURL}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => updateMutation.mutate()}
          disabled={isUpdating || updateMutation.isPending}
        >
          {isUpdating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Update
            </>
          )}
        </Button>
        <Button variant="destructive" onClick={() => setShowDelete(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </Button>
      </div>

      {isUpdating && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Updating mirror...</span>
            <span>{Math.round(updateProgress)}%</span>
          </div>
          <Progress value={updateProgress} className="h-2" />
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="packages">
            Packages ({packages.length})
          </TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Distribution
                </CardTitle>
                <Info className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {mirrorData.Distribution}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Components
                </CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {mirrorData.Components.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {mirrorData.Components.join(", ")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Architectures
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {mirrorData.Architectures.length}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {mirrorData.Architectures.map((arch) => (
                    <Badge key={arch} variant="secondary" className="text-xs">
                      {arch}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Packages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{packages.length}</div>
                <p className="text-xs text-muted-foreground">
                  Total packages in mirror
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Mirror Details</CardTitle>
              <CardDescription>Complete mirror configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Name:</span>
                  <p className="font-medium">{mirrorData.Name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Archive URL:</span>
                  <p className="font-medium">{mirrorData.ArchiveURL}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Distribution:</span>
                  <p className="font-medium">{mirrorData.Distribution}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Download Sources:
                  </span>
                  <p className="font-medium">
                    {mirrorData.DownloadWithSources ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Download Udebs:</span>
                  <p className="font-medium">
                    {mirrorData.DownloadUdebs ? "Yes" : "No"}
                  </p>
                </div>
                {mirrorData.Filter && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Filter:</span>
                    <p className="font-medium font-mono text-sm">
                      {mirrorData.Filter}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages">
          <Card>
            <CardHeader>
              <CardTitle>Packages</CardTitle>
              <CardDescription>
                Packages available in this mirror
              </CardDescription>
            </CardHeader>
            <CardContent>
              {packagesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : packages.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No packages found. Run an update to fetch packages.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Architecture</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packages.slice(0, 100).map((pkg) => (
                        <TableRow key={`${pkg.Name}-${pkg.Version}-${pkg.Architecture}`}>
                          <TableCell className="font-medium">
                            {pkg.Name}
                          </TableCell>
                          <TableCell>{pkg.Version}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{pkg.Architecture}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {packages.length > 100 && (
                    <p className="text-center text-sm text-muted-foreground py-4">
                      Showing 100 of {packages.length} packages
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Raw Configuration</CardTitle>
              <CardDescription>Mirror configuration as JSON</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(mirrorData, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mirror</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{mirrorName}&quot;? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
