-- X1 XDEX Analytics Platform - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TOKENS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tokens (
    address TEXT PRIMARY KEY,
    symbol TEXT,
    name TEXT,
    decimals INTEGER DEFAULT 9,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);

-- ============================================
-- POOLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS pools (
    address TEXT PRIMARY KEY,
    token_a TEXT REFERENCES tokens(address),
    token_b TEXT REFERENCES tokens(address),
    tvl NUMERIC DEFAULT 0,
    volume_24h NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pools_token_a ON pools(token_a);
CREATE INDEX IF NOT EXISTS idx_pools_token_b ON pools(token_b);
CREATE INDEX IF NOT EXISTS idx_pools_volume ON pools(volume_24h DESC);

-- ============================================
-- SWAPS TABLE (Main transaction data)
-- ============================================
CREATE TABLE IF NOT EXISTS swaps (
    signature TEXT PRIMARY KEY,
    slot BIGINT NOT NULL,
    block_time TIMESTAMP WITH TIME ZONE,
    
    pool_address TEXT REFERENCES pools(address),
    
    token_in_mint TEXT,
    token_out_mint TEXT,
    
    amount_in NUMERIC,
    amount_out NUMERIC,
    
    price NUMERIC,
    
    user_wallet TEXT,
    success BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_swaps_pool ON swaps(pool_address);
CREATE INDEX IF NOT EXISTS idx_swaps_time ON swaps(block_time DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_slot ON swaps(slot DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_user ON swaps(user_wallet);

-- ============================================
-- CANDLES TABLE (Aggregated OHLCV data)
-- ============================================
CREATE TABLE IF NOT EXISTS candles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_address TEXT NOT NULL,
    timeframe TEXT NOT NULL, -- '1m', '5m', '15m', '1h', '4h', '1d'
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume NUMERIC DEFAULT 0,
    
    trades_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(pool_address, timeframe, timestamp)
);

-- Indexes for chart queries
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(pool_address, timeframe, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_candles_time ON candles(timestamp DESC);

-- ============================================
-- INDEXER STATE TABLE (Track indexing progress)
-- ============================================
CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_slot BIGINT,
    last_run TIMESTAMP WITH TIME ZONE,
    total_swaps INTEGER DEFAULT 0,
    
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert initial state
INSERT INTO indexer_state (id, last_processed_slot, last_run)
VALUES (1, 0, NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Recent swaps with token info
CREATE OR REPLACE VIEW recent_swaps_view AS
SELECT 
    s.signature,
    s.block_time,
    s.pool_address,
    t_in.symbol as token_in_symbol,
    t_out.symbol as token_out_symbol,
    s.amount_in,
    s.amount_out,
    s.price,
    s.user_wallet
FROM swaps s
LEFT JOIN tokens t_in ON s.token_in_mint = t_in.address
LEFT JOIN tokens t_out ON s.token_out_mint = t_out.address
ORDER BY s.block_time DESC
LIMIT 100;

-- Pool statistics
CREATE OR REPLACE VIEW pool_stats_view AS
SELECT 
    p.address,
    t_a.symbol as token_a_symbol,
    t_b.symbol as token_b_symbol,
    p.tvl,
    p.volume_24h,
    COUNT(s.signature) as total_swaps,
    p.last_updated
FROM pools p
LEFT JOIN tokens t_a ON p.token_a = t_a.address
LEFT JOIN tokens t_b ON p.token_b = t_b.address
LEFT JOIN swaps s ON p.address = s.pool_address
GROUP BY p.address, t_a.symbol, t_b.symbol, p.tvl, p.volume_24h, p.last_updated
ORDER BY p.volume_24h DESC;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to generate candles from swaps
CREATE OR REPLACE FUNCTION generate_candles(
    p_pool_address TEXT,
    p_timeframe TEXT,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    timestamp TIMESTAMP WITH TIME ZONE,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH time_buckets AS (
        SELECT 
            date_trunc(
                CASE p_timeframe
                    WHEN '1m' THEN 'minute'
                    WHEN '5m' THEN 'minute'
                    WHEN '15m' THEN 'minute'
                    WHEN '1h' THEN 'hour'
                    WHEN '4h' THEN 'hour'
                    WHEN '1d' THEN 'day'
                END,
                s.block_time
            ) as bucket_time,
            s.price,
            s.amount_in,
            s.block_time,
            ROW_NUMBER() OVER (PARTITION BY date_trunc(
                CASE p_timeframe
                    WHEN '1m' THEN 'minute'
                    WHEN '5m' THEN 'minute'
                    WHEN '15m' THEN 'minute'
                    WHEN '1h' THEN 'hour'
                    WHEN '4h' THEN 'hour'
                    WHEN '1d' THEN 'day'
                END,
                s.block_time
            ) ORDER BY s.block_time ASC) as first_row,
            ROW_NUMBER() OVER (PARTITION BY date_trunc(
                CASE p_timeframe
                    WHEN '1m' THEN 'minute'
                    WHEN '5m' THEN 'minute'
                    WHEN '15m' THEN 'minute'
                    WHEN '1h' THEN 'hour'
                    WHEN '4h' THEN 'hour'
                    WHEN '1d' THEN 'day'
                END,
                s.block_time
            ) ORDER BY s.block_time DESC) as last_row
        FROM swaps s
        WHERE s.pool_address = p_pool_address
          AND s.block_time >= p_start_time
          AND s.block_time <= p_end_time
          AND s.success = true
    )
    SELECT 
        tb.bucket_time as timestamp,
        MAX(CASE WHEN tb.first_row = 1 THEN tb.price END) as open,
        MAX(tb.price) as high,
        MIN(tb.price) as low,
        MAX(CASE WHEN tb.last_row = 1 THEN tb.price END) as close,
        SUM(tb.amount_in) as volume
    FROM time_buckets tb
    GROUP BY tb.bucket_time
    ORDER BY tb.bucket_time;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (Optional - enable if needed)
-- ============================================

-- Enable RLS
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE candles ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read on tokens" ON tokens FOR SELECT USING (true);
CREATE POLICY "Allow public read on pools" ON pools FOR SELECT USING (true);
CREATE POLICY "Allow public read on swaps" ON swaps FOR SELECT USING (true);
CREATE POLICY "Allow public read on candles" ON candles FOR SELECT USING (true);

-- Only service role can write
CREATE POLICY "Service role write on tokens" ON tokens FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write on pools" ON pools FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write on swaps" ON swaps FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write on candles" ON candles FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- SAMPLE DATA (For testing)
-- ============================================

-- Insert WXNT token
INSERT INTO tokens (address, symbol, name, decimals)
VALUES (
    'WXNT - XNT Wrapper',
    'WXNT',
    'Wrapped XNT',
    9
) ON CONFLICT (address) DO NOTHING;

-- Insert the pool from your transaction
INSERT INTO pools (address, token_a, token_b)
VALUES (
    'wdLWfF28MtU6Tns7nix5xnfGPZufFKoME4FpFyaf3VW',
    'WXNT - XNT Wrapper',
    '54uAdhRHZmbGnD1tATH7F7Qp5us7xsXJQTf6MpMEdFbg'
) ON CONFLICT (address) DO NOTHING;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant permissions on tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Grant permissions on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================
-- DONE!
-- ============================================

-- Verify setup
SELECT 
    'Tokens' as table_name, 
    COUNT(*) as row_count 
FROM tokens
UNION ALL
SELECT 'Pools', COUNT(*) FROM pools
UNION ALL
SELECT 'Swaps', COUNT(*) FROM swaps
UNION ALL
SELECT 'Candles', COUNT(*) FROM candles
UNION ALL
SELECT 'Indexer State', COUNT(*) FROM indexer_state;
