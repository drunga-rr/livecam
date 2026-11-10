import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Broadcast from "./pages/Broadcast";
import AdminGate from "./components/AdminGate";
import Home from "./pages/Home";
import Watch from "./pages/Watch";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/broadcast"><AdminGate><Broadcast /></AdminGate></Route>
      <Route path="/watch/:roomId" component={Watch} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
