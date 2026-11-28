import { afterEach, beforeEach } from 'vitest'

// JSDOM has no native dialog implementation. Restore exact descriptors so
// these polyfills cannot change later suites in a reused DOM environment.
const methods = ['showModal', 'close'] as const
let originals: (PropertyDescriptor | undefined)[]
beforeEach(() => {
  originals = methods.map(method => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method))
  for (const method of methods) Object.defineProperty(HTMLDialogElement.prototype, method, {
    configurable: true, writable: true,
    value(this: HTMLDialogElement) {
      if (method === 'showModal') this.setAttribute('open', '')
      else this.removeAttribute('open')
    },
  })
})
afterEach(() => {
  methods.forEach((method, index) => {
    const original = originals[index]
    if (original) Object.defineProperty(HTMLDialogElement.prototype, method, original)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method)
  })
})
