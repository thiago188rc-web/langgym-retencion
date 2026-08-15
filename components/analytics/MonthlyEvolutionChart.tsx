"use client";

import { useState } from "react";
import type { PeriodMetric } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Users, UserPlus, UserMinus, Info } from "lucide-react";

interface MonthlyEvolutionChartProps {
  data: PeriodMetric[];
}

export function MonthlyEvolutionChart({ data }: MonthlyEvolutionChartProps) {
  const [showActivos, setShowActivos] = useState(true);
  const [showAltas, setShowAltas] = useState(true);
  const [showBajas, setShowBajas] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center">
        <Info size={28} className="mb-2 text-faint" />
        <p className="text-sm text-muted">No hay datos de evolución para el período seleccionado.</p>
      </Card>
    );
  }

  // Chart dimensions & scaling
  const chartHeight = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 35;

  const maxTotal = Math.max(...data.map((d) => d.total), 10);
  const maxChange = Math.max(...data.map((d) => Math.max(d.altas, d.bajas)), 5);
  // Y-axis max rounded up to a clean multiple
  const yMax = Math.ceil(maxTotal * 1.15);

  const getX = (index: number) => {
    if (data.length === 1) return 300;
    const availableWidth = 600 - paddingLeft - paddingRight;
    return paddingLeft + (index / (data.length - 1)) * availableWidth;
  };

  const getY = (val: number) => {
    const usableHeight = chartHeight - paddingTop - paddingBottom;
    return chartHeight - paddingBottom - (val / yMax) * usableHeight;
  };

  // Build SVG path for Alumnos Activos
  const linePoints = data.map((d, i) => `${getX(i)},${getY(d.total)}`).join(" ");
  const areaPath = data.length > 1
    ? `M ${getX(0)},${chartHeight - paddingBottom} L ${data.map((d, i) => `${getX(i)},${getY(d.total)}`).join(" L ")} L ${getX(data.length - 1)},${chartHeight - paddingBottom} Z`
    : "";

  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-fg">Evolución de Alumnos Mes a Mes</h3>
          <p className="text-[13px] text-muted">
            Base activa, altas y bajas detectadas en cada importación
          </p>
        </div>

        {/* Series Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowActivos(!showActivos)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all ${
              showActivos
                ? "bg-accent/15 text-accent border border-accent/30 shadow-sm"
                : "bg-card border border-border text-faint hover:text-muted"
            }`}
          >
            <div className="size-2 rounded-full bg-accent" />
            <span>Alumnos activos</span>
          </button>

          <button
            onClick={() => setShowAltas(!showAltas)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all ${
              showAltas
                ? "bg-info/15 text-info border border-info/30 shadow-sm"
                : "bg-card border border-border text-faint hover:text-muted"
            }`}
          >
            <div className="size-2 rounded-full bg-info" />
            <span>Altas</span>
          </button>

          <button
            onClick={() => setShowBajas(!showBajas)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all ${
              showBajas
                ? "bg-danger/15 text-danger border border-danger/30 shadow-sm"
                : "bg-card border border-border text-faint hover:text-muted"
            }`}
          >
            <div className="size-2 rounded-full bg-danger" />
            <span>Bajas</span>
          </button>
        </div>
      </div>

      {/* Responsive SVG Chart */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox="0 0 600 240"
          className="w-full overflow-visible"
          style={{ height: "auto", maxHeight: "280px" }}
        >
          <defs>
            <linearGradient id="activosGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22a058" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#22a058" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="altasGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
            </linearGradient>
            <linearGradient id="bajasGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#be123c" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const val = Math.round(yMax * pct);
            const y = getY(val);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={600 - paddingRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.07)"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="rgba(255, 255, 255, 0.4)"
                  className="font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fill for Alumnos Activos */}
          {showActivos && areaPath && (
            <path d={areaPath} fill="url(#activosGradient)" />
          )}

          {/* Bars for Altas & Bajas */}
          {data.map((d, i) => {
            const x = getX(i);
            const barWidth = Math.min(18, 260 / (data.length * 2));
            const altasHeight = (d.altas / yMax) * (chartHeight - paddingTop - paddingBottom);
            const bajasHeight = (d.bajas / yMax) * (chartHeight - paddingTop - paddingBottom);
            const groundY = chartHeight - paddingBottom;

            return (
              <g key={`bars-${i}`}>
                {showAltas && d.altas > 0 && (
                  <rect
                    x={x - barWidth - 2}
                    y={groundY - altasHeight}
                    width={barWidth}
                    height={altasHeight}
                    rx="3"
                    fill="url(#altasGradient)"
                    className="transition-all duration-300 hover:opacity-100 opacity-80"
                  />
                )}
                {showBajas && d.bajas > 0 && (
                  <rect
                    x={x + 2}
                    y={groundY - bajasHeight}
                    width={barWidth}
                    height={bajasHeight}
                    rx="3"
                    fill="url(#bajasGradient)"
                    className="transition-all duration-300 hover:opacity-100 opacity-80"
                  />
                )}
              </g>
            );
          })}

          {/* Line for Alumnos Activos */}
          {showActivos && data.length > 1 && (
            <polyline
              fill="none"
              stroke="#22a058"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={linePoints}
            />
          )}

          {/* Node Points & Hover Touchpoints */}
          {data.map((d, i) => {
            const x = getX(i);
            const y = getY(d.total);
            const isHovered = hoveredIdx === i;

            return (
              <g key={`point-${i}`} className="cursor-pointer">
                {/* Hover line marker */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={chartHeight - paddingBottom}
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeDasharray="2 2"
                  />
                )}

                {showActivos && (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 6 : 4}
                      fill="#0e1713"
                      stroke="#22a058"
                      strokeWidth={isHovered ? 3 : 2}
                      className="transition-all duration-200"
                    />
                    {isHovered && (
                      <circle cx={x} cy={y} r={9} fill="none" stroke="#22a058" strokeOpacity="0.4" />
                    )}
                  </>
                )}

                {/* X-Axis Month Label */}
                <text
                  x={x}
                  y={chartHeight - paddingBottom + 18}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isHovered ? "600" : "500"}
                  fill={isHovered ? "#22a058" : "rgba(255, 255, 255, 0.6)"}
                >
                  {d.label}
                </text>

                {/* Invisible hit area for hover */}
                <rect
                  x={x - 25}
                  y={paddingTop}
                  width={50}
                  height={chartHeight - paddingTop - paddingBottom}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip when hovered */}
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div
            className="pointer-events-none absolute top-2 rounded-xl border border-border/80 bg-[#131d18]/95 p-3.5 shadow-2xl backdrop-blur-md transition-all text-xs"
            style={{
              left: `${Math.min(75, Math.max(10, (hoveredIdx / Math.max(1, data.length - 1)) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-2 font-semibold text-fg border-b border-border/60 pb-1.5 flex items-center justify-between gap-4">
              <span>{data[hoveredIdx].label}</span>
              <span className="font-mono text-faint text-[10px]">{data[hoveredIdx].archivo}</span>
            </div>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between gap-6 text-muted">
                <span className="flex items-center gap-1.5 text-accent font-medium">
                  <span className="size-1.5 rounded-full bg-accent" /> Alumnos activos:
                </span>
                <span className="font-mono font-bold text-fg">{data[hoveredIdx].total}</span>
              </div>
              <div className="flex items-center justify-between gap-6 text-muted">
                <span className="flex items-center gap-1.5 text-info font-medium">
                  <span className="size-1.5 rounded-full bg-info" /> Altas nuevas:
                </span>
                <span className="font-mono font-semibold text-info">+{data[hoveredIdx].altas}</span>
              </div>
              <div className="flex items-center justify-between gap-6 text-muted">
                <span className="flex items-center gap-1.5 text-danger font-medium">
                  <span className="size-1.5 rounded-full bg-danger" /> Bajas detectadas:
                </span>
                <span className="font-mono font-semibold text-danger">-{data[hoveredIdx].bajas}</span>
              </div>
              <div className="flex items-center justify-between gap-6 border-t border-border/40 pt-1 text-muted">
                <span>Crecimiento neto:</span>
                <span
                  className={`font-mono font-bold ${
                    data[hoveredIdx].neto >= 0 ? "text-accent" : "text-danger"
                  }`}
                >
                  {data[hoveredIdx].neto >= 0 ? `+${data[hoveredIdx].neto}` : data[hoveredIdx].neto}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
