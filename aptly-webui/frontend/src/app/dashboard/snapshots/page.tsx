"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { snapshots, mirrors, repos } from "@/lib/api";
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  GitCompare,
  Camera,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Snapshot {
  Name: string;
  CreatedAt: string;
  Description?: string;
}

export default function SnapshotsPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteSnapshot, setDeleteSnapshot] = useState<string | null>(null);
  const [diffSnapshot1, setDiffSnapshot1] = useState<string | null>(null);
  const [diffSnapshot2, setDiffSnapshot2] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const queryClient = useQueryClient();

  const { data: snapshotsData, isLoading } = useQuery({
    queryKey: ["snapshots"],
    queryFn: snapshots.list,
  });

  const { data: mirrorsData } = useQuery({
    queryKey: ["mirrors"],
    queryFn: mirrors.list,
  });

  const { data: reposData } = useQuery({
    queryKey: ["repos"],
    queryFn: repos.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => snapshots.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      setDeleteSnapshot(null);
    },
  });

  const filteredSnapshots =
    snapshotsData?.data?.filter((snapshot: Snapshot) =>
      snapshot.Name.toLowerCase().includes(search.toLowerCase())
    ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Snapshots</h1>
          <p className="text-muted-foreground">
            Manage point-in-time repository snapshots
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Snapshot
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search snapshots..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
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
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSnapshots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <p className="text-muted-foreground">
                      No snapshots found. Create one from a mirror or repo.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredSnapshots.map((snapshot: Snapshot) => (
                  <TableRow key={snapshot.Name}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/snapshots/${encodeURIComponent(snapshot.Name)}`}
                        className="hover:underline"
                      >
                        {snapshot.Name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {new Date(snapshot.CreatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {snapshot.Description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <Link
                            href={`/dashboard/snapshots/${encodeURIComponent(snapshot.Name)}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDiffSnapshot1(snapshot.Name);
                            setShowDiff(true);
                          }}
                          title="Compare"
                        >
                          <GitCompare className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteSnapshot(snapshot.Name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <SnapshotCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mirrors={mirrorsData?.data || []}
        repos={reposData?.data || []}
      />

      <SnapshotDiffDialog
        open={showDiff}
        onOpenChange={setShowDiff}
        snapshots={filteredSnapshots}
        snapshot1={diffSnapshot1}
        snapshot2={diffSnapshot2}
        onSnapshot1Change={setDiffSnapshot1}
        onSnapshot2Change={setDiffSnapshot2}
      />

      <AlertDialog
        open={!!deleteSnapshot}
        onOpenChange={() => setDeleteSnapshot(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the snapshot &quot;{deleteSnapshot}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSnapshot && deleteMutation.mutate(deleteSnapshot)}
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

interface SnapshotCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mirrors: { Name: string }[];
  repos: { Name: string }[];
}

function SnapshotCreateDialog({
  open,
  onOpenChange,
  mirrors,
  repos,
}: SnapshotCreateDialogProps) {
  const queryClient = useQueryClient();
  const [sourceType, setSourceType] = useState<"mirror" | "repo">("mirror");
  const [sourceName, setSourceName] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: () => {
      if (sourceType === "mirror") {
        return snapshots.createFromMirror(sourceName, {
          name: snapshotName,
          description: description || undefined,
        });
      }
      return snapshots.createFromRepo(sourceName, {
        name: snapshotName,
        description: description || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      onOpenChange(false);
      setSnapshotName("");
      setDescription("");
      setSourceName("");
    },
  });

  const availableSources = sourceType === "mirror" ? mirrors : repos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Snapshot</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Tabs
            value={sourceType}
            onValueChange={(v) => {
              setSourceType(v as "mirror" | "repo");
              setSourceName("");
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mirror">From Mirror</TabsTrigger>
              <TabsTrigger value="repo">From Repo</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>Source {sourceType === "mirror" ? "Mirror" : "Repository"}</Label>
            <Select value={sourceName} onValueChange={setSourceName}>
              <SelectTrigger>
                <SelectValue placeholder={`Select a ${sourceType}...`} />
              </SelectTrigger>
              <SelectContent>
                {availableSources.map((s) => (
                  <SelectItem key={s.Name} value={s.Name}>
                    {s.Name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Snapshot Name</Label>
            <Input
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="e.g., ubuntu-jammy-2024-01-15"
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this snapshot"
            />
          </div>

          <Button
            onClick={() => createMutation.mutate()}
            disabled={
              createMutation.isPending || !sourceName || !snapshotName
            }
            className="w-full"
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Camera className="mr-2 h-4 w-4" />
            Create Snapshot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SnapshotDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: Snapshot[];
  snapshot1: string | null;
  snapshot2: string | null;
  onSnapshot1Change: (name: string) => void;
  onSnapshot2Change: (name: string) => void;
}

function SnapshotDiffDialog({
  open,
  onOpenChange,
  snapshots: snapshotList,
  snapshot1,
  snapshot2,
  onSnapshot1Change,
  onSnapshot2Change,
}: SnapshotDiffDialogProps) {
  const { data: diffData, isLoading } = useQuery({
    queryKey: ["snapshot-diff", snapshot1, snapshot2],
    queryFn: () => {
      if (!snapshot1 || !snapshot2) return null;
      return snapshots.diff(snapshot1, snapshot2);
    },
    enabled: !!snapshot1 && !!snapshot2 && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Snapshots</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Snapshot</Label>
              <Select value={snapshot1 || ""} onValueChange={onSnapshot1Change}>
                <SelectTrigger>
                  <SelectValue placeholder="Select snapshot..." />
                </SelectTrigger>
                <SelectContent>
                  {snapshotList.map((s) => (
                    <SelectItem key={s.Name} value={s.Name}>
                      {s.Name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Second Snapshot</Label>
              <Select value={snapshot2 || ""} onValueChange={onSnapshot2Change}>
                <SelectTrigger>
                  <SelectValue placeholder="Select snapshot..." />
                </SelectTrigger>
                <SelectContent>
                  {snapshotList.map((s) => (
                    <SelectItem key={s.Name} value={s.Name}>
                      {s.Name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : diffData?.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 dark:bg-green-950 border rounded p-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Added ({diffData.data.Added?.length || 0})
                  </p>                </div>
                <div className="bg-red-50 dark:bg-red-950 border rounded p-3">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    Removed ({diffData.data.Removed?.length || 0})
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950 border rounded p-3">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Updated ({diffData.data.Updated?.length || 0})
                  </p>
                </div>
              </div>

              {diffData.data.Added?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-green-700 dark:text-green-300">
                    Added Packages
                  </h4>
                  <div className="bg-muted rounded p-2 text-sm font-mono max-h-40 overflow-y-auto">
                    {diffData.data.Added.map((pkg: string) => (
                      <div key={pkg} className="py-0.5">+ {pkg}</div>
                    ))}
                  </div>
                </div>
              )}

              {diffData.data.Removed?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-red-700 dark:text-red-300">
                    Removed Packages
                  </h4>
                  <div className="bg-muted rounded p-2 text-sm font-mono max-h-40 overflow-y-auto">
                    {diffData.data.Removed.map((pkg: string) => (
                      <div key={pkg} className="py-0.5">- {pkg}</div>
                    ))}
                  </div>
                </div>
              )}

              {diffData.data.Updated?.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-blue-700 dark:text-blue-300">
                    Updated Packages
                  </h4>
                  <div className="bg-muted rounded p-2 text-sm font-mono max-h-40 overflow-y-auto">
                    {diffData.data.Updated.map((pkg: string) => (
                      <div key={pkg} className="py-0.5">~ {pkg}</div>
                    ))}
                  </div>
                </div>
              )}

              {diffData.data.Added?.length === 0 &&
                diffData.data.Removed?.length === 0 &&
                diffData.data.Updated?.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No differences found between snapshots.
                  </p>
                )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Select two snapshots to compare.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
