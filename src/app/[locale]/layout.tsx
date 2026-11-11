import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { routing } from "@/i18n/routing";
import { ThemeScript } from "@/shared/presentation/theme/theme-script";
import { PwaRuntime } from "@/shared/presentation/pwa/pwa-runtime";

import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2457b3",
};

// Nonces are per response: HTML using them must never be prerendered or shared.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
    applicationName: "Lexora",
    appleWebApp: { capable: true, title: "Lexora", statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/icons/lexora.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // El segmento viene de la URL, que escribe quien quiera: se valida antes de
  // usarlo. Un idioma que no existe es un 404, no una página en blanco.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Fija el idioma de las traducciones para esta petición dinámica.
  setRequestLocale(locale);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // `lang` se corresponde con el idioma servido: los lectores de pantalla lo
    // usan para elegir la voz y la pronunciacion correctas.
    //
    // `suppressHydrationWarning` esta aqui porque `ThemeScript` escribe
    // `data-theme` en el elemento antes de que React hidrate. Es la unica
    // diferencia esperada entre servidor y cliente, y esta acotada a este nodo.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider>
          <PwaRuntime />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
