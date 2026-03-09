import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";

// Public pages
import Index from "./pages/Index";
import About from "./pages/About";
import Gallery from "./pages/Gallery";
import Events from "./pages/Events";
import Leaderboard from "./pages/Leaderboard";
import Register from "./pages/Register";
import Voting from "./pages/Voting";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import FAQ from "./pages/FAQ";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";
import PaymentPortal from "./pages/PaymentPortal";
import ShippingPolicy from "./pages/policies/ShippingPolicy";
import RefundPolicy from "./pages/policies/RefundPolicy";

// Auth pages
import UserLogin from "./pages/UserLogin";

// User dashboard pages
import UserDashboard from "./pages/dashboard/UserDashboard";
import UserEvents from "./pages/dashboard/UserEvents";
import UserRegistrations from "./pages/dashboard/UserRegistrations";
import UserResults from "./pages/dashboard/UserResults";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes with main layout */}
            <Route element={<MainLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/about" element={<About />} />
              <Route path="/events" element={<Events />} />
              <Route path="/gallery/:id?" element={<Gallery />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/register" element={<Register />} />
              <Route path="/voting/:eventId" element={<Voting />} />
              <Route path="/voting" element={<Voting />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/pay-event/:eventId" element={<PaymentPortal />} />
              <Route path="/shipping-policy" element={<ShippingPolicy />} />
              <Route path="/refund-policy" element={<RefundPolicy />} />
            </Route>

            {/* Auth routes */}
            <Route path="/user" element={<UserLogin />} />

            {/* User dashboard - accessible without login */}
            <Route path="/dashboard" element={<MainLayout />}>
              <Route index element={<UserDashboard />} />
              <Route path="events" element={<UserEvents />} />
              <Route path="registrations" element={<UserRegistrations />} />
              <Route path="results" element={<UserResults />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
