import type { ReactNode } from "react";

export function EaicTaskCard({ children }: { children: ReactNode }) {
  return (
    <div data-eaic-task-card className="mb-6 rounded-[22px] border border-black/8 bg-white/70 p-5 shadow-[0_28px_80px_rgba(17,17,17,0.08)]">
      {children}
    </div>
  );
}
