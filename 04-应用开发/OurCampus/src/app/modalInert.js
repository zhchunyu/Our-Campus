const inertOwners = new WeakMap()

// Nested portals share ownership so cleanup order cannot leave the app disabled.
export function acquireInert(element) {
  let ownership = inertOwners.get(element)
  if (!ownership) {
    ownership = { count: 0, previous: element.inert }
    inertOwners.set(element, ownership)
  }
  ownership.count += 1
  element.inert = true
  let released = false
  return () => {
    if (released) return
    released = true
    ownership.count -= 1
    if (ownership.count === 0) {
      element.inert = ownership.previous
      inertOwners.delete(element)
    }
  }
}
