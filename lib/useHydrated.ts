"use client";

import { useEffect, useState } from "react";

/** True only after the component has mounted on the client. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
