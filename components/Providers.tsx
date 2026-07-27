"use client";

import { ToastProvider } from "./Toast";
import { WriteErrorToast } from "./WriteErrorToast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WriteErrorToast />
      {children}
    </ToastProvider>
  );
}
