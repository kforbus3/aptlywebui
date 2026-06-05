"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { MirrorCreateWizard } from "@/components/mirror-create-wizard";
import { mirrors } from "@/lib/api";
import { Loader2, Plus, Trash2, Eye } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Mirror {
  Name: string;
  ArchiveURL: string;
  Distribution: string;
  Components: string[];
  Architectures: string[];
}

export default function MirrorsPage() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteMirror, setDeleteMirror] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: mirrorsData, isLoading } = useQuery({
    queryKey: ["mirrors"],
    queryFn: mirrors.list,
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => mirrors.delete(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mirrors"] });
      setDeleteMirror(null);
    },
  });

  const filteredMirrors =
    mirrorsData?.data?.filter((mirror: Mirror) =>
      mirror.Name.toLowerCase().includes(search.toLowerCase())
    ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mirrors</h1>
          <p className="text-muted-foreground">
            Manage remote repository mirrors
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Mirror
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search mirrors..."
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
                <TableHead>Distribution</TableHead>
                <TableHead>Components</TableHead>
                <TableHead>Architectures</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMirrors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <p className="text-muted-foreground">
                      No mirrors found. Create one to get started.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMirrors.map((mirror: Mirror) => (
                  <TableRow key={mirror.Name}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/mirrors/${encodeURIComponent(mirror.Name)}`}
                        className="hover:underline"
                      >
                        {mirror.Name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">
                        {mirror.ArchiveURL}
                      </p>
                    </TableCell>
                    <TableCell>{mirror.Distribution}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {mirror.Components.slice(0, 3).map((c) => (
                          <Badge key={c} variant="secondary" className="text-xs">
                            {c}
                          </Badge>
                        ))}
                        {mirror.Components.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{mirror.Components.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {mirror.Architectures.map((a) => (
                          <Badge key={a} variant="outline" className="text-xs">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                        >
                          <Link
                            href={`/dashboard/mirrors/${encodeURIComponent(mirror.Name)}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteMirror(mirror.Name)}
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

      <MirrorCreateWizard open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog
        open={!!deleteMirror}
        onOpenChange={() => setDeleteMirror(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mirror</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mirror &quot;{deleteMirror}&quot;? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMirror && deleteMutation.mutate(deleteMirror)}
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
