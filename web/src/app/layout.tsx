import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { FluidParticlesBackground } from "@/components/fluid-particles-background";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ArtMapify",
  description:
    "Turn any image into Minecraft ArtMap dye guides, in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col text-foreground">
        <FluidParticlesBackground asBackground particleCount={600} />
        {children}
      </body>
    </html>
  );
}
