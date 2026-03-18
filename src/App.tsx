import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Admin from "./pages/Admin.tsx";
import SignUp from "./pages/SignUp.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import RenewPlan from "./pages/RenewPlan.tsx";
import LandingPage from "./pages/LandingPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/site" element={<LandingPage />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/renew-plan" element={<RenewPlan />} />
          <Route path="/admin" element={<Admin />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
