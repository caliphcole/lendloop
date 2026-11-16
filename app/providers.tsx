"use client";
import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
const convex = process.env.NEXT_PUBLIC_CONVEX_URL ? new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL) : null;
export function Backend({children}:{children:ReactNode}) {
  if (!convex) return <main className="wrap"><h1>LendLoop</h1><p>Set NEXT_PUBLIC_CONVEX_URL and your Clerk keys to start the integrated app.</p></main>;
  return <ConvexProviderWithClerk client={convex} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}
