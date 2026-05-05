import { useEffect, useState } from 'react';
import {
  AreaChart as ReAreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { chartColors, chartTickStyle, chartFontFamily } from './ChartTheme.js';
import { fmt } from '../../lib/format.js';

/**
 * AreaChart — gráfico de crescimento (compplan, campanhas, etc.).
 *
 * Props:
 *   data: array de { x, y } ou { x, [series]: value }
 *   xKey, yKey OU series: array de { key, label, color }
 *   formatY: função pra formatar tick do Y
 *   formatTooltip: função pra formatar valor no tooltip
 */
export default function AreaChart({
  data = [],
  xKey = 'x',
  yKey = 'y',
  series = null,
  height = 240,
  color = 'cyan',
  formatY = (v) => v,
  formatTooltip = (v) => v,
  tooltipLabel = '',
}) {
  // Re-render quando trocar tema (cores recalculam)
  const [colors, setColors] = useState(chartColors());
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(chartColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const colorMap = {
    cyan: colors.cyan, green: colors.green, yellow: colors.yellow, red: colors.red,
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReAreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorMap[color]} stopOpacity={0.30} />
            <stop offset="100%" stopColor={colorMap[color]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey={xKey}
          axisLine={false}
          tickLine={false}
          tick={{ ...chartTickStyle, fill: colors.text }}
          dy={8}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ ...chartTickStyle, fill: colors.text }}
          tickFormatter={formatY}
          width={56}
        />
        <Tooltip
          cursor={{ stroke: colors.cyan, strokeOpacity: 0.3 }}
          contentStyle={{
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            fontFamily: chartFontFamily,
            fontSize: 12,
            padding: '8px 12px',
          }}
          labelStyle={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ color: colors.text }}
          formatter={(value) => [formatTooltip(value), tooltipLabel]}
        />
        {series ? (
          series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color || colorMap[color]}
              strokeWidth={2}
              fill={`url(#grad-${color})`}
              activeDot={{ r: 4, strokeWidth: 2 }}
            />
          ))
        ) : (
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={colorMap[color]}
            strokeWidth={2}
            fill={`url(#grad-${color})`}
            activeDot={{ r: 4, strokeWidth: 2, stroke: colorMap[color], fill: colors.surface }}
          />
        )}
      </ReAreaChart>
    </ResponsiveContainer>
  );
}
