import { useEffect, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

type UseRealtimeOptions = {
  enabled?: boolean;
  name: string;
  supabase: SupabaseClient<Database>;
  setup: (channel: RealtimeChannel) => RealtimeChannel;
};

export function useRealtime({ enabled = true, name, supabase, setup }: UseRealtimeOptions) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const channel = setup(supabase.channel(name));

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [enabled, name, setup, supabase]);

  return { connected };
}
