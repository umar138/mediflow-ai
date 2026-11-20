import "./globals.css";

export const metadata = {
  title: "MediFlow AI — Smart Clinical Queue & Triage",
  description: "Clinical workflow & triage decision-support tool — not a medical diagnosis.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}