import { readFileSync } from "node:fs";

const { tickets } = JSON.parse(readFileSync(new URL("./data.json", import.meta.url), "utf8"));
const metrics = [
  { label: "Open tickets", value: tickets.filter((ticket) => ticket.status === "Open").length },
  { label: "Waiting for customer", value: tickets.filter((ticket) => ticket.status === "Waiting").length },
  { label: "Resolved tickets", value: tickets.filter((ticket) => ticket.status === "Resolved").length },
];

export const pages = [
  {
    slug: "index", title: "Support overview", description: "Customer support workload and recent tickets.",
    header: { title: "Support overview", section: "dashboard" },
    metrics,
    list: { title: "Recent tickets", tickets: tickets.slice(0, 2) },
  },
  {
    slug: "tickets", title: "All support tickets", description: "Browse the customer support queue.",
    header: { title: "All support tickets", section: "tickets" },
    list: { title: "Ticket queue", tickets },
  },
  ...tickets.map((ticket) => ({
    slug: ticket.href.split("/")[1],
    title: `${ticket.id}: ${ticket.subject}`,
    description: `Support ticket from ${ticket.customer}.`,
    header: { title: ticket.id, section: "tickets" },
    ticket,
  })),
];
