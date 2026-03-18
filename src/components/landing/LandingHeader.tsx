import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface LandingHeaderProps {
  primaryColor: string;
}

export function LandingHeader({ primaryColor }: LandingHeaderProps) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              OM
            </div>
            <span className="text-xl font-bold text-gray-900">
              OrçaMóvel <span style={{ color: primaryColor }}>PRO</span>
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <button onClick={() => scrollTo("hero")} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Início
            </button>
            <button onClick={() => scrollTo("benefits")} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Benefícios
            </button>
            <button onClick={() => scrollTo("plans")} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Planos
            </button>
            <button onClick={() => scrollTo("addons")} className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Add-ons
            </button>
            <Button
              onClick={() => navigate("/app")}
              style={{ backgroundColor: primaryColor }}
              className="text-white hover:opacity-90 transition-opacity"
            >
              Entrar
            </Button>
          </nav>

          {/* Mobile toggle */}
          <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
          <button onClick={() => scrollTo("hero")} className="block w-full text-left text-sm font-medium text-gray-600 py-2">Início</button>
          <button onClick={() => scrollTo("benefits")} className="block w-full text-left text-sm font-medium text-gray-600 py-2">Benefícios</button>
          <button onClick={() => scrollTo("plans")} className="block w-full text-left text-sm font-medium text-gray-600 py-2">Planos</button>
          <button onClick={() => scrollTo("addons")} className="block w-full text-left text-sm font-medium text-gray-600 py-2">Add-ons</button>
          <Button onClick={() => navigate("/app")} style={{ backgroundColor: primaryColor }} className="w-full text-white">
            Entrar
          </Button>
        </div>
      )}
    </header>
  );
}
