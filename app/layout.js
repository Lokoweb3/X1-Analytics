export const metadata = {
  title: 'X1 Analytics',
  description: 'Real-time analytics for X1 blockchain',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
