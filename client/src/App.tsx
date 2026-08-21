import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Ballot from "./pages/Ballot";
import Account from "./pages/Account";
import AccountSecurity from "./pages/AccountSecurity";
import ElectionManager from "./pages/ElectionManager";
import Home from "./pages/Home";
import Workspace from "./pages/Workspace";

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/account" component={Account} /><Route path="/account/security" component={AccountSecurity} /><Route path="/workspace" component={Workspace} /><Route path="/elections/:electionId" component={ElectionManager} /><Route path="/ballot/:electionId" component={Ballot} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
