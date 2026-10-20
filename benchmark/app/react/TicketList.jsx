import { StatusBadge } from "./StatusBadge.jsx";

export function TicketList({ title, tickets }) {
  return <section className="ticket-list" aria-labelledby="queue-title">
    <h2 id="queue-title">{title}</h2>
    <ul>{tickets.map((ticket) => <li className="ticket-row" key={ticket.id}>
      <div>
        <a href={ticket.href}>{ticket.subject}</a>
        <p>{ticket.customer} / {ticket.company}</p>
        <p className="ticket-meta">{ticket.id} / {ticket.priority} priority / Updated {ticket.updated}</p>
      </div>
      <div><StatusBadge label={ticket.status} /></div>
    </li>)}</ul>
  </section>;
}
