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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { publish, snapshots, gpg } from "@/lib/api";
import {
  Loader2,
  Plus,
  Trash2,
  SwitchCamera,
  Globe,
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

interface PublishedRepo {
  Prefix: string;
  Distribution: string;
  Sources: Array<{
    Component: string;
    Name: string;
  }>;
  Architectures: string[];
  Signing?: {
    Skip?: boolean;
    Batch?: boolean;
    GpgKey?: string;
    Keyring?: string;
    SecretKeyring?: string;
    Passphrase?: string;
    PassphraseFile?: string;
  };
}

export default function PublishPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [selectedPublish, setSelectedPublish] = useState<{
    prefix: string;
    distribution: string;
  } | null>(null);
  const [deletePublish, setDeletePublish] = useState<{
    prefix: string;
    distribution: string;
  } | null>(null);
  const queryClient = useQueryClient();

  const { data: publishData, isLoading } = useQuery({
    queryKey: ["publish"],
    queryFn: publish.list,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ prefix, distribution }: { prefix: string; distribution: string }) =>
      publish.delete(prefix, distribution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      setDeletePublish(null);
    },
  });

  const filteredPublish =
    publishData?.data?.filter((pub: PublishedRepo) =>
      `${pub.Prefix}/${pub.Distribution}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Published Repositories</h1>
          <p className="text-muted-foreground">
            Manage published repository endpoints
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Publish
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search published repos..."
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
                <TableHead>Prefix</TableHead>
                <TableHead>Distribution</TableHead>
                <TableHead>Components</TableHead>
                <TableHead>Architectures</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPublish.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <p className="text-muted-foreground">
                      No published repositories. Publish a snapshot to get started.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPublish.map((pub: PublishedRepo) => (
                  <TableRow key={`${pub.Prefix}/${pub.Distribution}`}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/publish/${encodeURIComponent(pub.Prefix || "_")}/${encodeURIComponent(pub.Distribution)}`}
                        className="hover:underline flex items-center gap-2"
                      >
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        {pub.Prefix || "(root)"}
                      </Link>
                    </TableCell>
                    <TableCell>{pub.Distribution}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(pub.Sources.map((s) => s.Component))).map((comp) => (
                          <Badge key={comp} variant="secondary" className="text-xs">
                            {comp}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {pub.Architectures.slice(0, 3).map((arch) => (
                          <Badge key={arch} variant="outline" className="text-xs">
                            {arch}
                          </Badge>
                        ))}
                        {pub.Architectures.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{pub.Architectures.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedPublish({
                              prefix: pub.Prefix,
                              distribution: pub.Distribution,
                            });
                            setSwitchOpen(true);
                          }}
                          title="Switch Snapshots"
                        >
                          <SwitchCamera className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeletePublish({
                              prefix: pub.Prefix,
                              distribution: pub.Distribution,
                            })
                          }
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

      <PublishCreateDialog open={createOpen} onOpenChange={setCreateOpen} />

      <PublishSwitchDialog
        open={switchOpen}
        onOpenChange={setSwitchOpen}
        prefix={selectedPublish?.prefix || ""}
        distribution={selectedPublish?.distribution || ""}
      />

      <AlertDialog
        open={!!deletePublish}
        onOpenChange={() => setDeletePublish(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish Repository</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unpublish &quot;{deletePublish?.prefix || "(root)"}/{deletePublish?.distribution}&quot;?
              This will remove the published endpoint but keep the snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletePublish &&
                deleteMutation.mutate({
                  prefix: deletePublish.prefix,
                  distribution: deletePublish.distribution,
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface PublishCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PublishCreateDialog({ open, onOpenChange }: PublishCreateDialogProps) {
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState("");
  const [distribution, setDistribution] = useState("");
  const [sourceSnapshot, setSourceSnapshot] = useState("");
  const [component, setComponent] = useState("main");
  const [architectures, setArchitectures] = useState<string[]>(["amd64"]);
  const [gpgKey, setGpgKey] = useState("");
  const [skipSigning, setSkipSigning] = useState(false);

  const { data: snapshotsData } = useQuery({
    queryKey: ["snapshots"],
    queryFn: snapshots.list,
  });

  const { data: gpgData } = useQuery({
    queryKey: ["gpg-keys"],
    queryFn: gpg.listKeys,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      publish.publishSnapshot(prefix || "_", {
        SourceKind: "snapshot",
        Sources: [
          {
            Name: sourceSnapshot,
            Component: component,
          },
        ],
        Distribution: distribution,
        ...(skipSigning ? { Skip: true } : gpgKey ? { GpgKey: gpgKey } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      onOpenChange(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setPrefix("");
    setDistribution("");
    setSourceSnapshot("");
    setComponent("main");
    setArchitectures(["amd64"]);
    setGpgKey("");
    setSkipSigning(false);
  };

  const allArchitectures = ["amd64", "i386", "arm64", "armhf", "ppc64el", "s390x"];

  const toggleArchitecture = (arch: string) => {
    setArchitectures((prev) =>
      prev.includes(arch) ? prev.filter((a) => a !== arch) : [...prev, arch]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish Snapshot</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prefix">Prefix (optional)</Label>
              <Input
                id="prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g., mycompany"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty for root prefix
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="distribution">Distribution *</Label>
              <Input
                id="distribution"
                value={distribution}
                onChange={(e) => setDistribution(e.target.value)}
                placeholder="e.g., jammy"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Source Snapshot *</Label>
            <Select value={sourceSnapshot} onValueChange={setSourceSnapshot}>
              <SelectTrigger>
                <SelectValue placeholder="Select a snapshot..." />
              </SelectTrigger>
              <SelectContent>
                {snapshotsData?.data?.map((s: { Name: string }) => (
                  <SelectItem key={s.Name} value={s.Name}>
                    {s.Name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="component">Component</Label>
            <Input
              id="component"
              value={component}
              onChange={(e) => setComponent(e.target.value)}
              placeholder="e.g., main"
            />
          </div>

          <div className="space-y-2">
            <Label>Architectures</Label>
            <div className="flex flex-wrap gap-2">
              {allArchitectures.map((arch) => (
                <label
                  key={arch}
                  className="flex items-center space-x-2 border rounded px-3 py-1 cursor-pointer hover:bg-muted"
                >
                  <Checkbox
                    checked={architectures.includes(arch)}
                    onCheckedChange={() => toggleArchitecture(arch)}
                  />
                  <span className="text-sm">{arch}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label>GPG Signing</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                checked={skipSigning}
                onCheckedChange={(checked) => setSkipSigning(checked === true)}
              />
              <Label className="cursor-pointer">Skip GPG signing</Label>
            </div>

            {!skipSigning && (
              <div className="space-y-2 pt-2">
                <Label>GPG Key (optional)</Label>
                <Select value={gpgKey} onValueChange={setGpgKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a GPG key..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gpgData?.data?.map((key: { KeyID: string; Uids: string[] }) => (
                      <SelectItem key={key.KeyID} value={key.KeyID}>
                        {key.KeyID.substring(0, 16)} - {key.Uids[0] || "Unknown"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button
            onClick={() => createMutation.mutate()}
            disabled={
              createMutation.isPending ||
              !distribution ||
              !sourceSnapshot ||
              architectures.length === 0
            }
            className="w-full"
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Globe className="mr-2 h-4 w-4" />
            Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PublishSwitchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefix: string;
  distribution: string;
}

function PublishSwitchDialog({
  open,
  onOpenChange,
  prefix,
  distribution,
}: PublishSwitchDialogProps) {
  const queryClient = useQueryClient();
  const [newSnapshot, setNewSnapshot] = useState("");
  const [forceOverwrite, setForceOverwrite] = useState(false);

  const { data: snapshotsData } = useQuery({
    queryKey: ["snapshots"],
    queryFn: snapshots.list,
  });

  const switchMutation = useMutation({
    mutationFn: () =>
      publish.switch(prefix, distribution, {
        Snapshots: [{ Component: "main", Name: newSnapshot }],
        ForceOverwrite: forceOverwrite,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publish"] });
      onOpenChange(false);
      setNewSnapshot("");
      setForceOverwrite(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Switch Published Snapshot</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Switching {prefix || "(root)"}/{distribution} to a new snapshot
          </p>

          <div className="space-y-2">
            <Label>New Snapshot *</Label>
            <Select value={newSnapshot} onValueChange={setNewSnapshot}>
              <SelectTrigger>
                <SelectValue placeholder="Select a snapshot..." />
              </SelectTrigger>
              <SelectContent>
                {snapshotsData?.data?.map((s: { Name: string }) => (
                  <SelectItem key={s.Name} value={s.Name}>
                    {s.Name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              checked={forceOverwrite}
              onCheckedChange={(checked) => setForceOverwrite(checked === true)}
            />
            <Label className="cursor-pointer">Force overwrite</Label>
          </div>

          <Button
            onClick={() => switchMutation.mutate()}
            disabled={switchMutation.isPending || !newSnapshot}
            className="w-full"
          >
            {switchMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <SwitchCamera className="mr-2 h-4 w-4" />
            Switch Snapshot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
