"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mirrors } from "@/lib/api";
import { Loader2, AlertCircle } from "lucide-react";

interface MirrorCreateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UBUNTU_PRESETS = {
  "noble-24.04": {
    name: "ubuntu-noble",
    archiveURL: "http://archive.ubuntu.com/ubuntu",
    distribution: "noble",
    components: ["main", "restricted", "universe", "multiverse"],
    architectures: ["amd64", "i386"],
    filterFormula: "",
  },
  "jammy-22.04": {
    name: "ubuntu-jammy",
    archiveURL: "http://archive.ubuntu.com/ubuntu",
    distribution: "jammy",
    components: ["main", "restricted", "universe", "multiverse"],
    architectures: ["amd64", "i386"],
    filterFormula: "",
  },
  "focal-20.04": {
    name: "ubuntu-focal",
    archiveURL: "http://archive.ubuntu.com/ubuntu",
    distribution: "focal",
    components: ["main", "restricted", "universe", "multiverse"],
    architectures: ["amd64", "i386"],
    filterFormula: "",
  },
  "bionic-18.04": {
    name: "ubuntu-bionic",
    archiveURL: "http://archive.ubuntu.com/ubuntu",
    distribution: "bionic",
    components: ["main", "restricted", "universe", "multiverse"],
    architectures: ["amd64", "i386"],
    filterFormula: "",
  },
};

const DEBIAN_PRESETS = {
  "bookworm-12": {
    name: "debian-bookworm",
    archiveURL: "http://deb.debian.org/debian",
    distribution: "bookworm",
    components: ["main", "contrib", "non-free"],
    architectures: ["amd64", "i386"],
    filterFormula: "",
  },
  "bullseye-11": {
    name: "debian-bullseye",
    archiveURL: "http://deb.debian.org/debian",
    distribution: "bullseye",
    components: ["main", "contrib", "non-free"],
    architectures: ["amd64", "i386"],
    filterFormula: "",
  },
};

const ALL_COMPONENTS = [
  "main",
  "restricted",
  "universe",
  "multiverse",
  "contrib",
  "non-free",
];

const ALL_ARCHITECTURES = ["amd64", "i386", "arm64", "armhf", "ppc64el", "s390x"];

export function MirrorCreateWizard({
  open,
  onOpenChange,
}: MirrorCreateWizardProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showEsx, setShowEsx] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    archiveURL: "",
    distribution: "",
    components: ["main"] as string[],
    architectures: ["amd64"] as string[],
    filterFormula: "",
    // ESM config
    esxEnabled: false,
    esxURL: "",
    esxToken: "",
    esxSeries: "",
  });

  const createMutation = useMutation({
    mutationFn: mirrors.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mirrors"] });
      onOpenChange(false);
      setStep(1);
      setFormData({
        name: "",
        archiveURL: "",
        distribution: "",
        components: ["main"],
        architectures: ["amd64"],
        filterFormula: "",
        esxEnabled: false,
        esxURL: "",
        esxToken: "",
        esxSeries: "",
      });
      router.push("/dashboard/mirrors");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const applyPreset = (preset: keyof typeof UBUNTU_PRESETS) => {
    const config = UBUNTU_PRESETS[preset];
    setFormData((prev) => ({
      ...prev,
      ...config,
    }));
  };

  const toggleComponent = (component: string) => {
    setFormData((prev) => ({
      ...prev,
      components: prev.components.includes(component)
        ? prev.components.filter((c) => c !== component)
        : [...prev.components, component],
    }));
  };

  const toggleArchitecture = (arch: string) => {
    setFormData((prev) => ({
      ...prev,
      architectures: prev.architectures.includes(arch)
        ? prev.architectures.filter((a) => a !== arch)
        : [...prev.architectures, arch],
    }));
  };

  const handleSubmit = () => {
    setError(null);
    const data: {
      Name: string;
      ArchiveURL: string;
      Distribution: string;
      Components: string[];
      Architectures: string[];
      FilterFormula?: string;
    } = {
      Name: formData.name,
      ArchiveURL: formData.esxEnabled ? formData.esxURL : formData.archiveURL,
      Distribution: formData.distribution,
      Components: formData.components,
      Architectures: formData.architectures,
    };

    if (formData.filterFormula) {
      data.FilterFormula = formData.filterFormula;
    }

    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Mirror</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Tabs value={`step-${step}`} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="step-1" disabled={step !== 1}>
              Preset
            </TabsTrigger>
            <TabsTrigger value="step-2" disabled={step !== 2}>
              Configure
            </TabsTrigger>
            <TabsTrigger value="step-3" disabled={step !== 3}>
              Review
            </TabsTrigger>
          </TabsList>

          {/* Step 1: Choose Preset */}
          <TabsContent value="step-1" className="space-y-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Ubuntu Presets</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(UBUNTU_PRESETS).map(([key, preset]) => (
                    <Button
                      key={key}
                      variant="outline"
                      onClick={() => {
                        applyPreset(key as keyof typeof UBUNTU_PRESETS);
                        setStep(2);
                      }}
                      className="justify-start"
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Debian Presets</h4>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(DEBIAN_PRESETS).map(([key, preset]) => (
                    <Button
                      key={key}
                      variant="outline"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          ...preset,
                        }));
                        setStep(2);
                      }}
                      className="justify-start"
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                  className="w-full"
                >
                  Create Custom Mirror →
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Step 2: Configure */}
          <TabsContent value="step-2" className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Mirror Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="e.g., ubuntu-jammy"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="distribution">Distribution *</Label>
                  <Input
                    id="distribution"
                    value={formData.distribution}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        distribution: e.target.value,
                      }))
                    }
                    placeholder="e.g., jammy"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="archiveURL">Archive URL *</Label>
                <Input
                  id="archiveURL"
                  value={formData.archiveURL}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      archiveURL: e.target.value,
                    }))
                  }
                  placeholder="http://archive.ubuntu.com/ubuntu"
                />
              </div>

              {/* Components */}
              <div className="space-y-2">
                <Label>Components</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_COMPONENTS.map((component) => (
                    <label
                      key={component}
                      className="flex items-center space-x-2 border rounded px-3 py-1 cursor-pointer hover:bg-muted"
                    >
                      <Checkbox
                        checked={formData.components.includes(component)}
                        onCheckedChange={() => toggleComponent(component)}
                      />
                      <span className="text-sm capitalize">{component}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Architectures */}
              <div className="space-y-2">
                <Label>Architectures</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_ARCHITECTURES.map((arch) => (
                    <label
                      key={arch}
                      className="flex items-center space-x-2 border rounded px-3 py-1 cursor-pointer hover:bg-muted"
                    >
                      <Checkbox
                        checked={formData.architectures.includes(arch)}
                        onCheckedChange={() => toggleArchitecture(arch)}
                      />
                      <span className="text-sm">{arch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ESM Support */}
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={showEsx}
                    onCheckedChange={(checked) => setShowEsx(checked === true)}
                  />
                  <Label className="cursor-pointer">
                    Configure Ubuntu ESM (Extended Security Maintenance)
                  </Label>
                </div>

                {showEsx && (
                  <div className="space-y-4 pl-6 border-l-2">
                    <div className="space-y-2">
                      <Label htmlFor="esxURL">ESM Repository URL</Label>
                      <Input
                        id="esxURL"
                        value={formData.esxURL}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            esxURL: e.target.value,
                            esxEnabled: true,
                          }))
                        }
                        placeholder="https://esm.ubuntu.com/infra/ubuntu"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="esxToken">ESM Token</Label>
                      <Input
                        id="esxToken"
                        type="password"
                        value={formData.esxToken}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            esxToken: e.target.value,
                          }))
                        }
                        placeholder="Your Ubuntu Pro token"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="esxSeries">Series (e.g., trusty, xenial)</Label>
                      <Input
                        id="esxSeries"
                        value={formData.esxSeries}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            esxSeries: e.target.value,
                          }))
                        }
                        placeholder="trusty"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Formula */}
              <div className="space-y-2">
                <Label htmlFor="filterFormula">
                  Filter Formula (optional)
                </Label>
                <Textarea
                  id="filterFormula"
                  value={formData.filterFormula}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filterFormula: e.target.value,
                    }))
                  }
                  placeholder="e.g., $PackageType (nginx | curl)"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Use Aptly filter syntax to select specific packages
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={
                    !formData.name ||
                    !formData.archiveURL ||
                    !formData.distribution ||
                    formData.components.length === 0 ||
                    formData.architectures.length === 0
                  }
                >
                  Review →
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Step 3: Review */}
          <TabsContent value="step-3" className="space-y-4">
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <h4 className="font-medium">Mirror Configuration</h4>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Name:</span>{" "}
                    <span className="font-medium">{formData.name}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">URL:</span>{" "}
                    {formData.esxEnabled ? formData.esxURL : formData.archiveURL}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Distribution:</span>{" "}
                    {formData.distribution}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Components:</span>{" "}
                    {formData.components.join(", ")}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Architectures:</span>{" "}
                    {formData.architectures.join(", ")}
                  </p>
                  {formData.filterFormula && (
                    <p>
                      <span className="text-muted-foreground">Filter:</span>{" "}
                      {formData.filterFormula}
                    </p>
                  )}
                  {formData.esxEnabled && (
                    <p>
                      <span className="text-muted-foreground">ESM:</span> Enabled
                      ({formData.esxSeries})
                    </p>
                  )}
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Creating a mirror will download package metadata. You can update
                  the mirror later to fetch packages.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {createMutation.isPending ? "Creating..." : "Create Mirror"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
