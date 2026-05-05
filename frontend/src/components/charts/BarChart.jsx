import { useEffect, useState } from 'react';
import {
  BarChart as ReBarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { chartColors, chartTickStyle, chartFontFamily } from './ChartTheme.js';

/**
 * BarChart horizontal/vertical pra ranking (estudos mais usados, etc.).
 */
export default function BarChart({
  data = [],
  xKey = 'name',
  yKey = 'value',
  height = 280,
  color = 'cyan',
  layout = 'horizontal',
  formatValue = (v) => v,
  highlightTopN = 0,
}) {
  const [colors, setColors] = useState(chartColors());
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(chartColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const baseColor = { cyan: colors.cyan, green: colors.green, yellow: colors.yellow, red: colors.red }[color];

  const isHorizontal = layout === 'horizontal';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ReBarChart
        data={data}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 24, left: isHorizontal ? 100 : 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="2 4" stroke={colors.grid}
          horizontal={!isHorizontal} vertical={isHorizontal} />
        {isHorizontal ? (
          <>
            <XAxis type="number" axisLine={false} tickLine={false}
              tick={{ ...chartTickStyle, fill: colors.text }} tickFormatter={formatValue} />
            <YAxis type="category" dataKey={xKey} axisLine={false} tickLine={false}
              tick={{ ...chartTickStyle, fill: colors.text }} width={100} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} axisLine={false} tickLine={false}
              tick={{ ...chartTickStyle, fill: colors.text }} dy={8} />
            <YAxis axisLine={false} tickLine={false}
              tick={{ ...chartTickStyle, fill: colors.text }} tickFormatter={formatValue} width={56} />
          </>
        )}
        <Tooltip
          cursor={{ fill: colors.grid, opacity: 0.4 }}
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
          formatter={(value) => [formatValue(value), '']}
        />
        <Bar dataKey={yKey} radius={[6, 6, 6, 6]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={i < highlightTopN ? baseColor : colors.cyanDim}
              fillOpacity={i < highlightTopN ? 1 : 0.4}
            />
          ))}
        </Bar>
      </ReBarChart>
    </ResponsiveContainer>
  );
}
