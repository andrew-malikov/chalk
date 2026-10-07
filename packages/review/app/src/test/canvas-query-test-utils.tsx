import { createCanvasQueryClient } from "@canvas/review/canvas-query";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

/** A fresh canvas query client for each mounted test tree. */
export function TestCanvasQuery({
  client: provided,
  children,
}: {
  client?: QueryClient;
  children: ReactNode;
}) {
  const [client] = useState(() => provided ?? createCanvasQueryClient());
  useEffect(() => () => client.clear(), [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
