import { formatDay } from '@/lib/format';

interface CompletionChartProps {
  data: { date: string; count: number }[];
}

// One series, so one hue (the palette's slot 1). The card title names it, so there is no legend. Bars are thin
// with rounded tops on a hairline baseline, and each shows its value on hover or focus. The table below is the
// exact-number twin for anyone who needs the figures.
export function CompletionChart({ data }: CompletionChartProps) {
  // The scale is a multiple of 4, so the midline is always a whole number and never repeats the top label.
  const top = Math.max(4, Math.ceil(Math.max(...data.map((day) => day.count)) / 4) * 4);
  const total = data.reduce((sum, day) => sum + day.count, 0);
  const peakIndex = data.findIndex((day) => day.count === top);
  const last = data.length - 1;

  return (
    <figure className="chart" aria-label={`Tasks completed per day, last ${data.length} days, ${total} in total`}>
      <div className="chart-plot">
        <span className="chart-axis" style={{ bottom: '100%' }}>
          {top}
        </span>
        <span className="chart-axis" style={{ bottom: '50%' }}>
          {Math.round(top / 2)}
        </span>
        <span className="chart-axis" style={{ bottom: '0%' }}>
          0
        </span>

        <div className="chart-bars">
          {data.map((day, index) => {
            const height = `${(day.count / top) * 100}%`;
            return (
              <div key={day.date} className="bar-col">
                {day.count > 0 ? (
                  <div className="bar" style={{ height }} tabIndex={0} aria-label={`${formatDay(day.date)}: ${day.count} completed`}>
                    <span className="bar-tip" aria-hidden="true">
                      {formatDay(day.date)} · {day.count} completed
                    </span>
                  </div>
                ) : (
                  <div className="bar-hit" tabIndex={0} aria-label={`${formatDay(day.date)}: none completed`}>
                    <span className="bar-tip" aria-hidden="true">
                      {formatDay(day.date)} · none
                    </span>
                  </div>
                )}
                {index === peakIndex || index === last ? (
                  <span className="bar-value" style={{ bottom: `calc(${height} + 4px)` }} aria-hidden="true">
                    {day.count}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-x" aria-hidden="true">
        {data.map((day, index) => (
          <span key={day.date}>{index === last ? 'Today' : index % 2 === 1 ? formatDay(day.date) : ''}</span>
        ))}
      </div>

      <details className="chart-table">
        <summary>View as table</summary>
        <table>
          <caption className="sr-only">Tasks completed per day</caption>
          <thead>
            <tr>
              <th scope="col">Day (UTC)</th>
              <th scope="col">Completed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((day) => (
              <tr key={day.date}>
                <td>{formatDay(day.date)}</td>
                <td>{day.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
