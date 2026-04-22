import { useEffect } from "react";
import { useSettings } from "./store/settings";
import { useAgent } from "./store/agent";
import { useFeed } from "./store/feed";
import { useAutopilot } from "./store/autopilot";
import { Setup } from "./components/Setup";
import { Cockpit } from "./components/Cockpit";

export default function App() {
  const { config, loaded, load } = useSettings();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offAgent = useAgent.getState().bindStreams();
    const offFeed = useFeed.getState().bindToAgent();
    const offAutopilot = useAutopilot.getState().bindToAgent();
    return () => {
      offAgent();
      offFeed();
      offAutopilot();
    };
  }, []);

  if (!loaded) {
    return <BootSplash />;
  }

  if (!config.privacyDisclosureAccepted) {
    return <Setup />;
  }

  return <Cockpit />;
}

function BootSplash() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-ink-0">
      <pre className="text-text-secondary text-xs leading-tight font-mono opacity-60 select-none">
{`  ┌──────────────┐
  │   I D E X    │
  └──────────────┘`}
      </pre>
    </div>
  );
}
