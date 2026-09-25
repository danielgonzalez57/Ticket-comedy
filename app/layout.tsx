import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { siteUrl } from "@/lib/constants";
import "./globals.css";

// Fonts are self-hosted (latin subset, variable woff2 from Google Fonts)
// so the build never depends on reaching Google — a failed fetch there
// used to break Vercel deploys.
const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

// Distinctive display face for headlines — characterful but still a
// modern grotesque (keeps the clean/premium feel, drops the generic).
const display = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  variable: "--font-display",
  weight: "600 800",
  display: "swap",
});

const DESCRIPTION =
  "Pinto & Aparte (Pinto y Aparte): shows de stand-up comedy en Venezuela. Compra tus entradas con Pago Móvil o Binance.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "Pinto & Aparte — Stand-up comedy",
  description: DESCRIPTION,
  applicationName: "Pinto & Aparte",
  openGraph: {
    type: "website",
    locale: "es_VE",
    siteName: "Pinto & Aparte",
    title: "Pinto & Aparte — Stand-up comedy",
    description: DESCRIPTION,
    images: [{ url: "/logo.png", alt: "Pinto & Aparte" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="tc-grain relative min-h-full flex flex-col bg-background text-foreground"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* Fixed atmosphere layer (lemon glow). */}
          <div
            aria-hidden
            className="tc-atmosphere pointer-events-none fixed inset-0 -z-10"
          />
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
