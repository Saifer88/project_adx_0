import { Header } from "./Header.jsx";
import { Metrics } from "./Metrics.jsx";
import { TicketList } from "./TicketList.jsx";
import { TicketDetail } from "./TicketDetail.jsx";

export function App({ page }) {
  return <>
    <Header {...page.header} />
    {page.metrics && <Metrics metrics={page.metrics} />}
    {page.list && <TicketList {...page.list} />}
    {page.ticket && <TicketDetail ticket={page.ticket} />}
  </>;
}
