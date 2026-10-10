export function setup(props) {
  return { label: props.label }
}

export function onPing(state, event) {
  emit('ping', { label: state.label, target: event.target })
}
