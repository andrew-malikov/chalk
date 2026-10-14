import type { ActivitySnapshot } from "@review/node/review-api/activity";
import { createContext } from "react";

export const AuthoringActivityContext = createContext<
  ActivitySnapshot | "unknown" | undefined
>(undefined);
