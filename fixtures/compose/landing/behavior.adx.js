export function setup(props) {
  return {
    brand: props.brand,
    who: props.who,
    role: props.role
  }
}

export function onNav(state) {
  emit('nav', { brand: state.brand })
}

export function onFollow(state) {
  emit('follow', { who: state.who })
}
