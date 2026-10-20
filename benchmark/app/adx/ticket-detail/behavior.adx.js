export function setup(props) {
  return {
    ticket: props.ticket,
    emailHref: "mailto:" + props.ticket.email,
    priority: props.ticket.priority,
    normal: props.ticket.priority === "Normal",
    high: props.ticket.priority === "High",
    draft: props.ticket.draft,
    invalid: false,
    message: "Draft not saved."
  }
}

export function onPriority(state, event) {
  state.priority = event.target.value
  state.normal = state.priority === "Normal"
  state.high = state.priority === "High"
  state.message = "Draft not saved."
}

export function onDraft(state, event) {
  state.draft = event.target.value
  state.invalid = false
  state.message = "Draft not saved."
}

export function onSave(state, event) {
  event.preventDefault()
  state.invalid = !state.draft.trim()
  state.message = state.invalid
    ? "Enter a response before saving."
    : "Draft saved for " + state.ticket.id + " (" + state.priority + "): " + state.draft.trim()
}
