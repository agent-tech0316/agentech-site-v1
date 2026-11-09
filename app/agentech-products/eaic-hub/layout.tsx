import { AgentechLibraryAccessGate } from "@/components/agentech-library-access-gate";
import { headers } from "next/headers";
import { isLocalRequest } from "@/lib/local-auth-bypass";

export default async function EaicHubLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (process.env.NODE_ENV !== "production" || isLocalRequest(await headers())) {
    return children;
  }

  return <AgentechLibraryAccessGate signedInWorkspace>{children}</AgentechLibraryAccessGate>;
}
