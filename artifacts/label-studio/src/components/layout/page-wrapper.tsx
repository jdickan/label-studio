import { ReactNode } from "react";

export default function PageWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-auto">
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full">
        {children}
      </div>
    </div>
  );
}
