"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mirrors, repos } from "@/lib/api";
import { Search, Package, Loader2, Filter, Database } from "lucide-react";

interface PackageResult {
  Name: string;
  Version: string;
  Architecture: string;
  Description?: string;
  Source?: string;
  SourceType?: "mirror" | "repo" | "snapshot";
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [sourceType, setSourceType] = useState<"all" | "mirror" | "repo">("all");
  const [architecture, setArchitecture] = useState<string>("all");
  const [exactMatch, setExactMatch] = useState(false);

  const { data: mirrorsData } = useQuery({
    queryKey: ["mirrors"],
    queryFn: mirrors.list,
  });

  const { data: reposData } = useQuery({
    queryKey: ["repos"],
    queryFn: repos.list,
  });

  // Simulated search results - in production, this would call a search API
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ["package-search", searchTerm, selectedSource, sourceType, architecture],
    queryFn: async () => {
      if (!searchTerm) return [];

      // In production, this would be an API call to a search endpoint
      // For now, we'll return mock results based on the search
      const mockResults: PackageResult[] = [
        {
          Name: `${searchTerm}`,
          Version: "1.0.0-1",
          Architecture: architecture === "all" ? "amd64" : architecture,
          Description: `Package matching "${searchTerm}"`,
          Source: selectedSource === "all" ? "ubuntu-jammy" : selectedSource,
          SourceType: "mirror",
        },
      ];

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 300));
      return mockResults;
    },
    enabled: searchTerm.length > 0,
  });

  const handleSearch = () => {
    setSearchTerm(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const allSources = [
    ...(mirrorsData?.data?.map((m: { Name: string }) => ({
      name: m.Name,
      type: "mirror" as const,
    })) || []),
    ...(reposData?.data?.map((r: { Name: string }) => ({
      name: r.Name,
      type: "repo" as const,
    })) || []),
  ];

  const architectures = ["all", "amd64", "i386", "arm64", "armhf", "ppc64el", "s390x"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Package Search</h1>
        <p className="text-muted-foreground">
          Search for packages across mirrors, repositories, and snapshots
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search packages... (e.g., nginx, curl, python3)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
        </div>
        <Button onClick={handleSearch} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Search
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as typeof sourceType)}>
                <SelectTrigger>
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="mirror">Mirrors Only</SelectItem>
                  <SelectItem value="repo">Repositories Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Specific Source</Label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger>
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {allSources
                    .filter((s) => sourceType === "all" || s.type === sourceType)
                    .map((source) => (
                      <SelectItem key={source.name} value={source.name}>
                        <div className="flex items-center gap-2">
                          <Database className="h-3 w-3" />
                          {source.name}
                          <Badge variant="outline" className="text-xs">
                            {source.type}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Architecture</Label>
              <Select value={architecture} onValueChange={setArchitecture}>
                <SelectTrigger>
                  <SelectValue placeholder="All architectures" />
                </SelectTrigger>
                <SelectContent>
                  {architectures.map((arch) => (
                    <SelectItem key={arch} value={arch}>
                      {arch === "all" ? "All Architectures" : arch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              checked={exactMatch}
              onCheckedChange={(checked) => setExactMatch(checked === true)}
            />
            <Label className="cursor-pointer">Exact match only</Label>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-4">
        {searchTerm && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">
              Results for &quot;{searchTerm}&quot;
              {searchResults && (
                <span className="text-muted-foreground ml-2">
                  ({searchResults.length} found)
                </span>
              )}
            </h2>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : searchResults && searchResults.length > 0 ? (
          <div className="space-y-2">
            {searchResults.map((pkg: PackageResult) => (
              <Card key={`${pkg.Name}-${pkg.Version}-${pkg.Architecture}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-semibold">{pkg.Name}</h3>
                        <Badge variant="secondary">{pkg.Version}</Badge>
                        <Badge variant="outline">{pkg.Architecture}</Badge>
                      </div>
                      {pkg.Description && (
                        <p className="text-sm text-muted-foreground">
                          {pkg.Description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Database className="h-3 w-3" />
                        Found in: {pkg.Source}
                        {pkg.SourceType && (
                          <Badge variant="outline" className="text-xs">
                            {pkg.SourceType}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : searchTerm ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No packages found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search terms or filters
            </p>
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Search Packages</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enter a package name to search across all mirrors, repositories, and snapshots.
              Use filters to narrow down results by source or architecture.
            </p>
          </div>
        )}
      </div>

      {/* Where is this package? */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle>Where is this package?</CardTitle>
          <CardDescription>
            Find which mirrors or snapshots contain a specific package
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Enter package name..." className="max-w-sm" />
            <Button variant="secondary">
              <Search className="mr-2 h-4 w-4" />
              Find
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This will search all mirrors, local repositories, and snapshots to find where
            the package is available.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
