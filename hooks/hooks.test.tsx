import { expect, test } from 'claude-code/testing'

const MESSAGE = {
  plugin: 'redact-secrets',
  component: 'UserMessage',
  requestId: 'msg-1',
  surface: 'terminal',
} as const

test('a prompt reaches the engine masked, with a counted toast in the locale', async ($, on) => {
  const toasts: string[] = []
  on('env.get', (_, e) => ({ value: e.name === 'LANG' ? 'it_IT.UTF-8' : undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // Stands for the engine: what arrives here is what the model would read.
  on('prompt.submit', (_, e) => ({ text: e.text }))

  const result = await $.prompt.submit({ text: 'mail mario.rossi@gmail.com tel +39 333 123 4567' })

  expect(result.text).toBe('mail ⟦email:mar•••⟧ tel ⟦phone:+39•••⟧')
  expect(toasts).toEqual(["🔒 Dati sensibili oscurati prima dell'invio: 2"])
})

test('a prompt with nothing sensitive passes unchanged and raises no toast', async ($, on) => {
  const toasts: string[] = []
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))

  const result = await $.prompt.submit({ text: 'refactor the login page' })

  expect(result.text).toBe('refactor the login page')
  expect(toasts).toEqual([])
})

test('a masked value is drawn highlighted in the transcript, on every surface', async ($, on) => {
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({
      ...MESSAGE,
      surface,
      props: { text: 'mail ⟦email:mar•••⟧ ok', origin: { kind: 'composer' }, isExpanded: true },
    })

    expect((await ui.find({ type: 'Text', text: /🔒 mar•••/ }))?.text).toBe('> mail  🔒 mar•••  ok')
    await ui.unmount()
  }
})

test('a message with nothing masked is left to the engine', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({
    ...MESSAGE,
    props: { text: 'hello', origin: { kind: 'composer' }, isExpanded: true },
  })

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('the countries option limits which national IDs are masked', { options: { countries: 'IT' } }, async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  const result = await $.prompt.submit({ text: 'cf RSSMRA85T10A562S pan ABCDE1234F' })

  expect(result.text).toBe('cf ⟦id:RSS•••⟧ pan ABCDE1234F')
})

test('the color option paints the highlight', { options: { color: 'green' } }, async ($, on) => {
  const ui = await $.ui.mount({
    ...MESSAGE,
    props: { text: '⟦email:mar•••⟧', origin: { kind: 'composer' }, isExpanded: true },
  })

  const chip = await ui.find({ type: 'Text', text: /^ 🔒 mar••• $/ })
  expect(chip?.props.backgroundColor).toBe('#9ece6a')
  await ui.unmount()
})

const BAND = {
  plugin: 'redact-secrets',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  props: { hasSurvey: false, bodyColumns: 120 },
} as const

test('the banner greets on the first session and stays away once dismissed', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'redact-secrets' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /countries: all · color: purple/ }))?.text).toContain('redact-secrets')

  await ui.press({ key: 'dismiss' })
  expect(store.get('welcomed')).toBe(true)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})

test('/redact-secrets brings the banner back with the settings', { options: { countries: 'IT', color: 'green' } }, async ($, on) => {
  on('store.get', () => ({ value: true }))
  on('command.register', () => ({ value: { command: 'redact-secrets' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const result = await $.command.run({ command: 'redact-secrets', args: '' })
  expect(result.text).toBe('redact-secrets: countries IT, color green')

  const ui = await $.ui.mount(BAND)
  expect((await ui.find({ type: 'Text', text: /countries: IT · color: green/ }))?.text).toContain('redact-secrets')
  await ui.unmount()
})
