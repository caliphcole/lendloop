import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Backend } from "./providers";
import "./style.css";
export const metadata={title:"LendLoop",description:"A neighborhood tool-lending board"};
export default function Layout({children}:{children:ReactNode}) {
  const configured = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CONVEX_URL;
  return <html lang="en"><body>{configured
    ? <ClerkProvider><Backend>{children}</Backend></ClerkProvider>
    : <main className="wrap setup"><h1>LendLoop</h1><p>Set up Clerk and Convex to use the connected tool board.</p></main>
  }</body></html>;
}
