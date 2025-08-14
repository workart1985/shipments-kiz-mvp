// app/layout.tsx
import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Отгрузки + КИЗ (MVP)',
  description: 'Сканирование ШК и КИЗ, поставки и короба',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
	<html lang="ru">
	  <body className="bg-white text-gray-900 antialiased">
		{children}
	  </body>
	</html>
  );
}
