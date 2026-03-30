import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import Download from "@/pages/download";
import Clipper from "@/pages/clipper";
import Transcribe from "@/pages/transcribe";
import ToMp3 from "@/pages/to-mp3";
import Anime from "@/pages/anime";
import Podcast from "@/pages/podcast";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/download" component={Download} />
        <Route path="/clipper" component={Clipper} />
        <Route path="/transcribe" component={Transcribe} />
        <Route path="/to-mp3" component={ToMp3} />
        <Route path="/anime" component={Anime} />
        <Route path="/podcast" component={Podcast} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;