"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ISeriesApi, UTCTimestamp } from "lightweight-charts";

const POOL_DEFAULT = "VmZfZnHzFTKSf19ZvAxa4duzChve3JYHVCPq1FvezhN";

type TfKey = "1m" | "5m" | "1h";

const TIMEFRAMES: Record<
  TfKey,
  { label: string; refreshMs: number; limit: number }
> = {
  "1m": { label: "1m", refreshMs: 30_000, limit: 100 },
  "5m": { label: "5m", refreshMs: 45_000, limit: 100 },
  "1h": { label: "1h", refreshMs: 60_000, limit: 50 },
};

type CandleRow = {
  time_bucket: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume?: number;
};

export default function Page() {
  const [pool, setPool] = useState(POOL_DEFAULT);
  const [tf, setTf] = useState<TfKey>("1h");
  const [status, setStatus] = useState<string>("idle");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const cfg = useMemo(() => TIMEFRAMES[tf], [tf]);

  function toUnixSeconds(iso: string): UTCTimestamp {
    return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
  }

  async function loadCandles(signal?: AbortSignal) {
    if (!pool || pool.trim() === "") {
      setStatus("no pool address");
      return;
    }

    setStatus("loading...");
    const qs = new URLSearchParams({
      pool: pool.trim(),
      tf,
      limit: String(cfg.limit),
    });

    try {
      const res = await fetch(`/api/candles?${qs.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const rows = (await res.json()) as CandleRow[];

      if (!rows || rows.length === 0) {
        setStatus("no data");
        candleSeriesRef.current?.setData([]);
        return;
      }

      const data = rows
        .map((r) => ({
          time: toUnixSeconds(r.time_bucket),
          open: Number(r.open_price),
          high: Number(r.high_price),
          low: Number(r.low_price),
          close: Number(r.close_price),
        }))
        .sort((a, b) => Number(a.time) - Number(b.time));

      candleSeriesRef.current?.setData(data);
      
      // Auto-fit content after setting data
      setTimeout(() => {
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }, 100);

      setStatus(`✓ ${data.length} candles`);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("Load error:", e);
      setStatus(`error: ${e.message}`);
    }
  }

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: { 
        background: { color: "#0b0f1a" }, 
        textColor: "#cbd5e1" 
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.12)" },
        horzLines: { color: "rgba(148,163,184,0.12)" },
      },
      timeScale: { 
        timeVisible: true, 
        secondsVisible: false,
        borderColor: "rgba(148,163,184,0.2)",
        barSpacing: 15,
        minBarSpacing: 10,
      },
      rightPriceScale: { 
        borderVisible: false,
        scaleMargins: {
          top: 0.2,
          bottom: 0.2,
        },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: "rgba(148,163,184,0.3)",
          style: 2,
        },
        horzLine: {
          width: 1,
          color: "rgba(148,163,184,0.3)",
          style: 2,
        },
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
      priceFormat: {
        type: 'price',
        precision: 4,
        minMove: 0.0001,
      },
    });

    chartRef.current = chart;
    candleSeriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ autoSize: true });
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // Load on pool/tf change
  useEffect(() => {
    const ac = new AbortController();
    loadCandles(ac.signal).catch((e) => {
      if (e.name !== "AbortError") {
        setStatus(`error: ${e.message}`);
      }
    });
    return () => ac.abort();
  }, [pool, tf]);

  // Polling
  useEffect(() => {
    const ac = new AbortController();
    const id = setInterval(() => {
      loadCandles(ac.signal).catch((e) => {
        if (e.name !== "AbortError") {
          setStatus(`error: ${e.message}`);
        }
      });
    }, cfg.refreshMs);

    return () => {
      ac.abort();
      clearInterval(id);
    };
  }, [cfg.refreshMs, pool, tf]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070a12",
        color: "#e2e8f0",
        padding: 16,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 16, fontWeight: 600 }}>
          X1 Analytics — Candles
        </h1>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 13, opacity: 0.9 }}>Pool</label>
          <input
            value={pool}
            onChange={(e) => setPool(e.target.value.trim())}
            placeholder="Enter pool address..."
            style={{
              width: 520,
              maxWidth: "100%",
              padding: "10px 12px",
              background: "#0b1220",
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 10,
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            {Object.keys(TIMEFRAMES).map((k) => {
              const key = k as TfKey;
              const active = key === tf;
              return (
                <button
                  key={key}
                  onClick={() => setTf(key)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: active 
                      ? "1px solid rgba(34,197,94,0.5)" 
                      : "1px solid rgba(148,163,184,0.18)",
                    background: active ? "rgba(34,197,94,0.15)" : "#0b1220",
                    color: active ? "#22c55e" : "#e2e8f0",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {TIMEFRAMES[key].label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 13, opacity: 0.85 }}>
            Status: <span style={{ fontFamily: "monospace" }}>{status}</span>
          </div>
        </div>

        <div
          ref={chartContainerRef}
          style={{
            width: "100%",
            height: 650,
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.15)",
            overflow: "hidden",
            background: "#0b0f1a",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.3)",
          }}
        />

        <div style={{ 
          marginTop: 16, 
          fontSize: 12, 
          opacity: 0.6,
          textAlign: "center" 
        }}>
          💡 Tip: Scroll to zoom • Drag to pan • Click buttons to change timeframe
        </div>
      </div>
    </div>
  );
}
