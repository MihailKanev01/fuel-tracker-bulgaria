import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Fuel Tracker Bulgaria", description: "Проверими цени на горивата в България" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="bg"><body>{children}</body></html>; }
