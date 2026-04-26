import './globals.css';

export const metadata = {
  title: 'AI Resume Checker',
  description: 'AI-powered resume checking tool',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
