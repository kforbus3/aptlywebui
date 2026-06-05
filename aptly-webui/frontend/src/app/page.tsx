import { Button } from "@/components/ui/button";
import { Package, Database, Camera, Globe, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">Aptly WebUI</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="mb-8 inline-flex items-center justify-center p-4 bg-primary/10 rounded-full">
            <Package className="h-12 w-12 text-primary" />
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Modern Aptly Repository Management
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-12">
            A comprehensive web interface for managing Aptly repositories.
            Create mirrors, manage snapshots, and publish packages—all without the command line.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <FeatureCard
              icon={Database}
              title="Mirror Management"
              description="Create and manage mirrors from external repositories"
            />
            <FeatureCard
              icon={Camera}
              title="Snapshot Lifecycle"
              description="Create, compare, and merge snapshots"
            />
            <FeatureCard
              icon={Globe}
              title="Publish Control"
              description="Publish and switch between snapshots safely"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-6 bg-card">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2024 Aptly WebUI. Built with Next.js and FastAPI.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Database;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 border rounded-lg bg-card hover:border-primary/50 transition-colors">
      <Icon className="h-8 w-8 text-primary mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
