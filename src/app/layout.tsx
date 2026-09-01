import type { Metadata } from "next";
import "./globals.css";
import "./fuel-selector.css";
import "./nearby-refresh.css";
export const metadata: Metadata = { title: "Fuel Tracker Bulgaria", description: "Проверими цени на горивата в България" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="bg"><body>{children}</body></html>; }
