export const metadata = {
  title: 'TrophyBase.app',
  description: 'Deine ultimative Trophäen-Datenbank',
}

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body className="bg-[#121314] text-gray-200 antialiased w-full max-w-full overflow-x-hidden">
        {/* Hier wird später jede Unterseite automatisch reingeladen */}
        {children}
      </body>
    </html>
  );
}