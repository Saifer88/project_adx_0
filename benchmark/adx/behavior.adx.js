export function setup(props) {
  return {
    name: props.name,
    avatar: props.avatar || '/default.png',
    bio: props.bio,
    role: props.role
  }
}

export function onClick(state, event) {
  emit('click', {
    name: state.name,
    target: event.target
  })
}

export function onFollowClick(state) {
  emit('follow', { name: state.name })
}
