interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: string;
  trend?: string;
  trendUp?: boolean;
}

export function MetricCard({ label, value, icon, trend, trendUp }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <div className="metric-value">{value}</div>
      {trend && (
        <div className={`metric-trend ${trendUp ? 'up' : trendUp === false ? 'down' : ''}`}>
          {trend}
        </div>
      )}
    </div>
  );
}
