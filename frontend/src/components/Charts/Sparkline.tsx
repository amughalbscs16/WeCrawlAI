import React from 'react';

type Props = {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  maxPoints?: number;
  tooltipLabel?: string;
};

// Minimal dependency-free sparkline using SVG
export const Sparkline: React.FC<Props> = ({
  data,
  width = 180,
  height = 40,
  stroke = '#3b82f6',
  fill = 'rgba(59,130,246,0.15)',
  maxPoints = 100,
  tooltipLabel,
}) => {
  const points = data.slice(-maxPoints);
  const n = points.length;
  const w = width;
  const h = height;

  if (n <= 1) {
    return <svg width={w} height={h} />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const dx = w / (n - 1);

  const path = points
    .map((v, i) => {
      const x = i * dx;
      const y = h - ((v - min) / range) * (h - 2) - 1; // padding 1px
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const area = `${path} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      aria-label={tooltipLabel}
      role="img"
    >
      <path d={area} fill={fill} stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export default Sparkline;

