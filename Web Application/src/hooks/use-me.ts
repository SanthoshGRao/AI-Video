"use client";

import { useQuery } from "@tanstack/react-query";

export type Me = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

/**
 * The signed-in user. Cached under a stable key so the several places that need
 * it (sidebar, project cards, the editor's lock banner) share one request.
 */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) return null;
      return (await res.json()) as Me;
    },
    staleTime: 5 * 60 * 1000,
  });
}
