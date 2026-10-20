export function Metrics({ metrics }) {
  return <section className="metrics" aria-label="Ticket metrics">
    {metrics.map((metric) => <article className="metric" key={metric.label}>
      <p>{metric.label}</p>
      <strong>{metric.value}</strong>
    </article>)}
  </section>;
}
