export function setup(props) {
  return {
    title: props.title,
    dashboardCurrent: props.section === "dashboard" ? "page" : undefined,
    ticketsCurrent: props.section === "tickets" ? "page" : undefined
  }
}
