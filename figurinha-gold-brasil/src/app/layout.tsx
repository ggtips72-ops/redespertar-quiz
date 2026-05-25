import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sua Figurinha GOLD do Mundial 2026 | Crie Agora ⭐",
  description:
    "Crie sua figurinha GOLD personalizada do Mundial 2026! Edição especial lenda com a camisa do Brasil. Apenas R$19,90.",
  robots: "index, follow",
  openGraph: {
    title: "Sua Figurinha GOLD do Mundial 2026 ⭐🇧🇷",
    description: "Crie sua figurinha GOLD personalizada do Mundial 2026 com a camisa do Brasil!",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@900&family=Kalam:wght@400;700&display=swap" rel="stylesheet" />
        {/* CartPanda compliance script */}
        <script type="text/javascript" src="https://assets.mycartpanda.com/cartx-ecomm-ui-assets/js/cpsales.js"></script>
      </head>
      <body className="min-h-full flex flex-col">
        <Script
          id="utmify-utms"
          src="https://cdn.utmify.com.br/scripts/utms/latest.js"
          data-utmify-prevent-xcod-sck=""
          data-utmify-prevent-subids=""
          data-utmify-ignore-iframe=""
          data-utmify-is-cartpanda=""
          strategy="afterInteractive"
        />
        <Script id="utmify-pixel" strategy="afterInteractive">{`
          window.pixelId = "69e65225030e6a3d770bd925";
          var a = document.createElement("script");
          a.setAttribute("async", "");
          a.setAttribute("defer", "");
          a.setAttribute("src", "https://cdn.utmify.com.br/scripts/pixel/pixel.js");
          document.head.appendChild(a);
        `}</Script>
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '1296717492654726');
          fbq('track', 'PageView');
        `}</Script>
        <noscript dangerouslySetInnerHTML={{ __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1296717492654726&ev=PageView&noscript=1"/>` }} />
        {children}
      </body>
    </html>
  );
}
