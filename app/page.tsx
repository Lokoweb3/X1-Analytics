"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, ISeriesApi, UTCTimestamp } from "lightweight-charts";

const POOL_DEFAULT = "wdLWfF28MtU6Tns7nix5xnfGPZufFKoME4FpFyaf3VW";

type TfKey = "1m" | "5m" | "1h";

const TIMEFRAMES: Record<
  TfKey,
  { label: string; refreshMs: number; limit: number }
> = {
  "1m": { label: "1m", refreshMs: 30_000, limit: 500 },
  "5m": { label: "5m", refreshMs: 45_000, limit: 500 },
  "1h": { label: "1h", refreshMs: 60_000, limit: 500 },
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
  const [tf, setTf] = useState<TfKey>("5m");
  const [status, setStatus] = useState<string>("idle");

  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const cfg = useMemo(() => TIMEFRAMES[tf], [tf]);

  function toUnixSeconds(iso: string): UTCTimestamp {
    return Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;
  }

  async function loadCandles(signal?: AbortSignal) {
    setStatus("loading...");
    const qs = new URLSearchParams({
      pool,
      tf,
      limit: String(cfg.limit),
    });

    const res = await fetch(`/api/candles?${qs.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`candles ${res.status}: ${text.slice(0, 300)}`);
    }

    const rows = (await res.json()) as CandleRow[];

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
    setStatus(`ok (${data.length} candles)`);
  }

  // init chart once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: { background: { color: "#0b0f1a" }, textColor: "#cbd5e1" },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.12)" },
        horzLines: { color: "rgba(148,163,184,0.12)" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = series;

    const ro = new ResizeObserver(() => chart.applyOptions({ autoSize: true }));
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  // load on pool/tf change
  useEffect(() => {
    const ac = new AbortController();
    loadCandles(ac.signal).catch((e) => setStatus(`error: ${String(e.message || e)}`));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, tf]);

  // polling
  useEffect(() => {
    const ac = new AbortController();
    const id = setInterval(() => {
      loadCandles(ac.signal).catch((e) => setStatus(`error: ${String(e.message || e)}`));
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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>X1 Analytics – Candles</h1>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <label style={{ fontSize: 12, opacity: 0.9 }}>Pool</label>
          <input
            value={pool}
            onChange={(e) => setPool(e.target.value.trim())}
            style={{
              width: 520,
              maxWidth: "100%",
              padding: "8px 10px",
              background: "#0b1220",
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 10,
              color: "#e2e8f0",
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
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.18)",
                    background: active ? "#1f2937" : "#0b1220",
                    color: "#e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  {TIMEFRAMES[key].label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Status: <span style={{ fontFamily: "monospace" }}>{status}</span>
          </div>
        </div>

        <div
          ref={chartContainerRef}
          style={{
            width: "100%",
            height: 560,
            borderRadius: 16,
            border: "1px solid rgba(148,163,184,0.15)",
            overflow: "hidden",
            background: "#0b0f1a",
          }}
        />
      </div>
    </div>
  );
}
