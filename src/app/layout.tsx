import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kestrel - Pre-publication Brand Governance',
  description: 'Pre-publication brand and accessibility governance workspace',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
