// Freshline — revenue chart, "like an exchange": mouse-wheel to zoom,
// drag to pan, no preset-range buttons. Built on lightweight-charts
// (TradingView's own library) instead of the old hand-drawn SVG polyline +
// 1W/1M/3M/1Y pills, which only ever showed 8 fixed buckets.
import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../../lib/format'

export interface RevenuePoint {
  /** Unix seconds (UTC midnight of that day) — numeric, not a date string,
   * so comparing the chart's visible range back against the data is a
   * plain number comparison. */
  time: UTCTimestamp
  value: number
}

export default function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const [visibleTotal, setVisibleTotal] = useState(0)

  // Chart instance: created once, destroyed on unmount. Colors are read
  // from the page's own CSS variables once at creation time — this site
  // has no light/dark toggle, so there's nothing to react to later.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--gesso-accent').trim() || '#1e5c3e'
    const divider = css.getPropertyValue('--gesso-divider').trim() || 'rgba(28,28,24,0.1)'
    const fgMuted = css.getPropertyValue('--gesso-fg-muted').trim() || '#55523f'

    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: fgMuted },
      grid: { horzLines: { color: divider }, vertLines: { visible: false } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: divider, labelBackgroundColor: accent },
        horzLine: { color: divider, labelBackgroundColor: accent },
      },
      autoSize: true,
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: accent,
      topColor: `${accent}33`,
      bottomColor: `${accent}00`,
      lineWidth: 2,
      priceFormat: { type: 'custom', minMove: 1, formatter: (v: number) => formatMoney(Math.round(v)) },
    })
    chartRef.current = chart
    seriesRef.current = series

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  // Data: pushed into the existing chart whenever it changes, instead of
  // recreating the whole chart (which would reset any zoom/pan the admin
  // already set up).
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return
    series.setData(data)
    chart.timeScale().fitContent()

    const recomputeVisibleTotal = () => {
      const range = chart.timeScale().getVisibleRange()
      if (!range) {
        setVisibleTotal(data.reduce((s, p) => s + p.value, 0))
        return
      }
      const from = range.from as number
      const to = range.to as number
      setVisibleTotal(data.filter((p) => p.time >= from && p.time <= to).reduce((s, p) => s + p.value, 0))
    }
    recomputeVisibleTotal()
    chart.timeScale().subscribeVisibleTimeRangeChange(recomputeVisibleTotal)
    return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(recomputeVisibleTotal)
  }, [data])

  return (
    <div>
      <div className="stat-line">
        <span className="stat-val">{formatMoney(visibleTotal)}</span>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 220 }} />
    </div>
  )
}
