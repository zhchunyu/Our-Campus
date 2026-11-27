import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [] }))
vi.mock('react', () => ({
  useState(initial) {
    const index = hooks.cursor++
    hooks.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
    return [hooks.slots[index].value, (value) => {
      const slot = hooks.slots[index]
      slot.value = typeof value === 'function' ? value(slot.value) : value
    }]
  },
  useRef(initial) {
    const index = hooks.cursor++
    return hooks.slots[index] ??= { current: initial }
  },
  useCallback(callback, dependencies) {
    const index = hooks.cursor++
    const previous = hooks.slots[index]
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) {
      hooks.slots[index] = { callback, dependencies }
    }
    return hooks.slots[index].callback
  },
  useEffect(effect, dependencies) {
    const index = hooks.cursor++
    const previous = hooks.slots[index]
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies[item]))) {
      hooks.effects.push(() => {
        previous?.cleanup?.()
        hooks.slots[index] = { dependencies, cleanup: effect() }
      })
    }
  },
}))

const mocks = vi.hoisted(() => ({
  plugin: { getStatus: vi.fn(), enable: vi.fn(), disable: vi.fn(), addListener: vi.fn(), consumePendingNotice: vi.fn() },
  client: { auth: { getSession: vi.fn() }, rpc: vi.fn() },
  setHeader: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'android' }, registerPlugin: () => mocks.plugin }))
vi.mock('../../data/supabaseClient.js', () => ({ requireSupabase: () => mocks.client }))
import { registerPushDevice } from '../../data/campusPush.js'
import { useCampusPush } from './useCampusPush.js'

const serverId = '12345678-1234-4123-8123-123456789123'
const enabledDevice = { configured: true, enabled: true, permission: 'granted', installationId: 'install-1', cid: 'getui-device-1' }
const success = { data: serverId, error: null }
const session = (id) => ({ data: { session: { user: { id }, access_token: `${id}-test-token` } }, error: null })
const onOpen = () => {}
let device
let userId
let authReady
let onRegistration

function render() {
  hooks.cursor = 0
  const result = useCampusPush(userId, onOpen, authReady)
  hooks.effects.splice(0).forEach((effect) => effect())
  return result
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  device = { ...enabledDevice }
  userId = 'member-a'
  authReady = true
  vi.resetAllMocks()
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }))
  mocks.plugin.getStatus.mockImplementation(async () => ({ ...device }))
  mocks.plugin.enable.mockImplementation(async () => { device.enabled = true; return { ...device } })
  mocks.plugin.disable.mockImplementation(async () => { device.enabled = false })
  mocks.plugin.consumePendingNotice.mockResolvedValue({})
  mocks.plugin.addListener.mockImplementation(async (event, handler) => {
    if (event === 'registration') onRegistration = handler
    return { remove() {} }
  })
  mocks.client.auth.getSession.mockImplementation(async () => session(userId))
  mocks.client.rpc.mockReturnValue({ setHeader: mocks.setHeader })
  mocks.setHeader.mockResolvedValue(success)
})

afterEach(() => {
  hooks.slots.forEach((slot) => slot?.cleanup?.())
  hooks.slots = []
  hooks.effects = []
  vi.unstubAllGlobals()
})

describe('push device confirmation', () => {
  it('rejects an empty or false registration result', async () => {
    for (const data of [null, false, '']) {
      mocks.setHeader.mockResolvedValueOnce({ data, error: null })
      await expect(registerPushDevice(device, userId)).resolves.toBe(false)
    }
  })

  it('uses the expected account token and skips the RPC on account mismatch', async () => {
    await expect(registerPushDevice(device, userId)).resolves.toBe(true)
    expect(mocks.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer member-a-test-token')
    await expect(registerPushDevice(device, 'member-b')).rejects.toThrow('账号已变化')
    expect(mocks.client.rpc).toHaveBeenCalledTimes(1)
  })

  it('waits for the server and retries a registration refusal', async () => {
    const response = deferred()
    mocks.setHeader.mockReturnValueOnce(response.promise)
    expect(render().registration).not.toBe('registered')
    await vi.waitFor(() => expect(render().registration).toBe('registering'))
    response.resolve({ data: false, error: null })
    await vi.waitFor(() => expect(render().registration).toBe('failed'))
    await render().refresh()
    expect(render().registration).toBe('registered')
  })

  it('discards the old account confirmation and requires explicit enablement for the new account', async () => {
    const previous = deferred()
    const current = deferred()
    mocks.setHeader.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise)
    render()
    await vi.waitFor(() => expect(mocks.setHeader).toHaveBeenCalledTimes(1))
    userId = 'member-b'
    expect(render().registration).not.toBe('registered')
    previous.resolve(success)
    await vi.waitFor(() => expect(render().status).toMatchObject({ configured: true, enabled: false }))
    expect(mocks.plugin.disable).toHaveBeenCalledTimes(1)
    expect(mocks.client.rpc).toHaveBeenCalledTimes(1)
    const enabling = render().enable()
    await vi.waitFor(() => expect(mocks.setHeader).toHaveBeenCalledTimes(2))
    expect(render().registration).toBe('registering')
    expect(mocks.plugin.enable).toHaveBeenCalledWith({ consent: true })
    expect(mocks.setHeader).toHaveBeenLastCalledWith('Authorization', 'Bearer member-b-test-token')
    current.resolve(success)
    await enabling
    expect(render().registration).toBe('registered')
  })

  it('does not transfer an old native opt-in after startup settles signed out', async () => {
    userId = undefined
    authReady = false
    render()
    await vi.waitFor(() => expect(render().status.enabled).toBe(true))
    expect(mocks.plugin.disable).not.toHaveBeenCalled()
    authReady = true
    render()
    await vi.waitFor(() => expect(render().status.enabled).toBe(false))
    userId = 'member-b'
    render()
    await vi.waitFor(() => expect(render().status).toMatchObject({ configured: true, enabled: false }))
    expect(mocks.client.rpc).not.toHaveBeenCalled()
  })

  it('preserves the opt-in when an existing login loads directly after startup', async () => {
    userId = undefined
    authReady = false
    render()
    userId = 'member-a'
    authReady = true
    render()
    await vi.waitFor(() => expect(render().registration).toBe('registered'))
    expect(mocks.plugin.disable).not.toHaveBeenCalled()
  })

  it('checks notification permission again after the registration request', async () => {
    const response = deferred()
    mocks.setHeader.mockReturnValueOnce(response.promise)
    render()
    await vi.waitFor(() => expect(mocks.setHeader).toHaveBeenCalledTimes(1))
    device.permission = 'denied'
    response.resolve(success)
    await vi.waitFor(() => expect(render().status.permission).toBe('denied'))
    expect(render().registration).not.toBe('registered')
  })

  it('clears confirmation while checking device settings after returning to the app', async () => {
    render()
    await vi.waitFor(() => expect(render().registration).toBe('registered'))
    const resumedStatus = deferred()
    mocks.plugin.getStatus.mockReturnValueOnce(resumedStatus.promise)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(render().registration).not.toBe('registered')
    resumedStatus.resolve({ ...device, permission: 'denied' })
    await vi.waitFor(() => expect(render().status.permission).toBe('denied'))
  })

  it('waits for the provider device identifier before calling the server', async () => {
    device.cid = ''
    render()
    await vi.waitFor(() => expect(render().status.permission).toBe('granted'))
    expect(mocks.client.rpc).not.toHaveBeenCalled()
    device.cid = enabledDevice.cid
    onRegistration()
    await vi.waitFor(() => expect(render().registration).toBe('registered'))
  })

  it('finishes the in-flight registration before disabling for logout', async () => {
    const response = deferred()
    mocks.setHeader.mockReturnValueOnce(response.promise)
    const push = render()
    await vi.waitFor(() => expect(mocks.setHeader).toHaveBeenCalledTimes(1))
    expect(push.disable).toBeTypeOf('function')
    const closing = push.disable()
    expect(render().action).toBe('disable')
    expect(mocks.plugin.disable).not.toHaveBeenCalled()
    response.resolve(success)
    await closing
    expect(mocks.client.rpc.mock.calls.map(([rpc]) => rpc)).toEqual(['campus_register_push_device', 'campus_disable_push_device'])
    expect(render().status.enabled).toBe(false)
    expect(render().registration).not.toBe('registered')
  })

  it('disables the server row by installation ID when the provider identifier is missing', async () => {
    const push = render()
    await vi.waitFor(() => expect(render().registration).toBe('registered'))
    device.cid = ''
    await push.disable()
    expect(mocks.client.rpc).toHaveBeenLastCalledWith('campus_disable_push_device', { p_installation_id: enabledDevice.installationId })
  })

  it('logs out without a new server call if this installation never enabled notifications', async () => {
    device = { ...device, enabled: false, cid: '' }
    await render().disable()
    expect(mocks.client.rpc).not.toHaveBeenCalled()
  })
})
