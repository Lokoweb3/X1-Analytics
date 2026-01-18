export default function Home() {
  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '10px' }}>🚀 X1 Analytics</h1>
      <p style={{ fontSize: '1.2rem', color: '#666' }}>Real-time analytics for X1 blockchain & XDEX</p>
      
      <div style={{ marginTop: '40px', padding: '30px', background: '#f8f9fa', borderRadius: '12px' }}>
        <h2>✅ Platform Status</h2>
        <ul style={{ fontSize: '1.1rem', lineHeight: '2' }}>
          <li>✅ Indexer: Active</li>
          <li>✅ Database: Connected</li>
          <li>✅ Monitoring XDEX swaps</li>
          <li>✅ Auto-updates every minute</li>
        </ul>
      </div>
      
      <div style={{ marginTop: '30px', padding: '20px', background: '#e3f2fd', borderRadius: '12px' }}>
        <h3>🔧 Indexer Endpoint</h3>
        <code style={{ background: '#fff', padding: '10px', borderRadius: '4px', display: 'block' }}>
          /api/indexer
        </code>
        <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>
          The indexer runs automatically every minute via Vercel Cron
        </p>
      </div>
      
      <div style={{ marginTop: '30px' }}>
        <h3>📊 Coming Soon</h3>
        <ul>
          <li>Live price charts with TradingView</li>
          <li>Recent swaps feed</li>
          <li>Pool statistics & TVL</li>
          <li>Token search & discovery</li>
        </ul>
      </div>
    </div>
  );
}
