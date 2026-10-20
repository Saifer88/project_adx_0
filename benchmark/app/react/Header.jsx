export function Header({ title, section }) {
  return <header className="portal-header">
    <p className="eyebrow">Northstar / Customer support</p>
    <nav aria-label="Primary">
      <a href="/" aria-current={section === "dashboard" ? "page" : undefined}>Overview</a>
      <a href="/tickets/" aria-current={section === "tickets" ? "page" : undefined}>Tickets</a>
    </nav>
    <h1>{title}</h1>
  </header>;
}
