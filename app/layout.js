import "../css/style.css";

export const metadata = {
  title: "Lawyer System",
  description: "Legacy lawyer system migrated to Next.js",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="stylesheet" href="/css/bootstrap.rtl.min.css" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
