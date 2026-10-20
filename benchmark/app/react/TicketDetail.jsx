import { useState } from "react";
import { StatusBadge } from "./StatusBadge.jsx";

export function TicketDetail({ ticket }) {
  const [priority, setPriority] = useState(ticket.priority);
  const [draft, setDraft] = useState(ticket.draft);
  const [invalid, setInvalid] = useState(false);
  const [message, setMessage] = useState("Draft not saved.");

  function onPriority(event) {
    setPriority(event.target.value);
    setMessage("Draft not saved.");
  }

  function onDraft(event) {
    setDraft(event.target.value);
    setInvalid(false);
    setMessage("Draft not saved.");
  }

  function onSave(event) {
    event.preventDefault();
    setInvalid(!draft.trim());
    setMessage(!draft.trim()
      ? "Enter a response before saving."
      : "Draft saved for " + ticket.id + " (" + priority + "): " + draft.trim());
  }

  return <article className="ticket-detail">
    <section aria-labelledby="subject">
      <h2 id="subject">{ticket.subject}</h2>
      <StatusBadge label={ticket.status} />
      <p>{ticket.description}</p>
    </section>
    <section className="customer" aria-labelledby="customer-title">
      <h2 id="customer-title">Customer</h2>
      <dl>
        <dt>Name</dt><dd>{ticket.customer}</dd>
        <dt>Company</dt><dd>{ticket.company}</dd>
        <dt>Email</dt><dd><a href={"mailto:" + ticket.email}>{ticket.email}</a></dd>
      </dl>
    </section>
    <form className="reply-form" onSubmit={onSave} aria-labelledby="reply-title">
      <h2 id="reply-title">Response draft</h2>
      <p className="hint" id="draft-hint">Local draft only. Changes reset when this page reloads.</p>
      <label htmlFor="priority">Priority</label>
      <select id="priority" value={priority} onChange={onPriority}>
        <option value="Normal">Normal</option>
        <option value="High">High</option>
      </select>
      <p className="hint">Current priority: {priority}</p>
      <label htmlFor="response">Response</label>
      <textarea id="response" value={draft} aria-invalid={invalid} aria-describedby="draft-hint draft-status" onChange={onDraft} />
      <button type="submit">Save draft</button>
      <p className="form-status" id="draft-status" role="status" aria-live="polite">{message}</p>
    </form>
  </article>;
}
