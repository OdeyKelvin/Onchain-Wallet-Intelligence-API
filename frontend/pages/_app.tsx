// ============================================================
//  Smart Money Analytics — pages/_app.tsx
//  Next.js App wrapper — loads global styles
// ============================================================

import type { AppProps } from "next/app";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
