import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HardDiskBackground } from "@/components/HardDiskBackground";
import { HardDrive, Files, Copy, Gauge, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Landing() {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/80 overflow-hidden">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center">
        {/* Background Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

        {/* 3D Background */}
        <div className="absolute inset-0 z-0">
          <HardDiskBackground />
        </div>

        {/* Content */}
        <div className="relative z-10 container mx-auto px-6 text-center">
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6">
            <span className="text-white">Data</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500">
              {" "}
              Vantage
            </span>
          </h1>
          <p className="text-xl md:text-2xl max-w-2xl mx-auto font-light mb-8">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
              Visualize your storage. Find duplicates. Reclaim space.
            </span>
          </p>
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all text-lg px-8 py-6"
            onClick={() => {
              try {
                localStorage.setItem("data-vantage-launched", "true");
              } catch (e) {}
              navigate("/dashboard");
            }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            Get Started
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 relative">
        <div className="container mx-auto px-6">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            Powerful Storage <span className="text-blue-500">Insights</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <FeatureCard
              icon={<HardDrive className="h-8 w-8 text-blue-500" />}
              title="Storage Analysis"
              description="Scan directories and visualize storage usage with interactive charts and folder hierarchies."
            />
            <FeatureCard
              icon={<Copy className="h-8 w-8 text-purple-500" />}
              title="Duplicate Detection"
              description="Find duplicate files using content-based hashing to reclaim wasted space efficiently."
            />
            <FeatureCard
              icon={<Gauge className="h-8 w-8 text-orange-500" />}
              title="Real-time Monitoring"
              description="Track scan progress in real-time with detailed statistics and performance metrics."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative">
        <div className="container mx-auto px-6 text-center">
          <div className="max-w-3xl mx-auto bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl p-12 border border-blue-500/20">
            <Files className="h-16 w-16 mx-auto mb-6 text-blue-500" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to optimize your storage?
            </h2>
            <p className="text-muted-foreground text-lg mb-8">
              Start scanning your directories and discover insights about your
              data.
            </p>
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg text-lg px-8 py-6"
              onClick={() => {
                try {
                  localStorage.setItem("data-vantage-launched", "true");
                } catch (e) {}
                navigate("/dashboard");
              }}
            >
              Launch Dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border text-center text-muted-foreground text-sm">
        <p>© 2026 Data Vantage. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-8 hover:border-blue-500/50 transition-all hover:shadow-lg">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
