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
  expect(toasts).toEqual(["🔒 Dati sensibili oscurati prima dell'invio: 📧 1 · 📞 1"])
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

test('what a tool prints reaches the model masked', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // Stands for the tool: `cat .env` printing a real key.
  on('tool.call', () => ({ result: { stdout: 'API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz', stderr: '', interrupted: false } }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'cat .env' })

  expect((ran.result as { stdout: string }).stdout).toBe('API_KEY=⟦key:sk-•••⟧')
})

test('output that cannot be checked is withheld, never passed on unmasked', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  // A BigInt makes JSON.stringify throw inside the masking hook.
  on('tool.call', () => ({ result: { stdout: 'API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz', size: 1n } }))

  const ran = await $.tool.call({ tool: 'Bash', command: 'cat .env' })

  expect(JSON.stringify(ran)).toContain('could not check this output, so it was withheld')
  expect(JSON.stringify(ran)).not.toContain('sk-ant-api03')
})

test('a write whose target cannot be read is refused before it runs', async ($, on) => {
  const ran: string[] = []
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => {
    throw new Error('EACCES')
  })
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    return { result: {} }
  })

  const write = await $.tool.call({ tool: 'Write', file_path: '/app/.env', content: 'PORT=4000\n' })

  expect(JSON.stringify(write)).toContain('could not check this write')
  expect(ran).toEqual([])
})

test('a placeholder is never written over a real value', async ($, on) => {
  const written: string[] = []
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: 'API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz\nPORT=3000\n' }))
  on('tool.call', (_, e) => {
    written.push(e.tool)
    return { result: {} }
  })

  const write = await $.tool.call({ tool: 'Write', file_path: '/app/.env', content: 'API_KEY=⟦secret:sk-•••⟧\nPORT=4000\n' })
  const edit = await $.tool.call({ tool: 'Edit', file_path: '/app/.env', old_string: 'PORT=3000', new_string: 'PORT=⟦secret:300•••⟧' })
  const fine = await $.tool.call({ tool: 'Edit', file_path: '/app/.env', old_string: 'PORT=3000', new_string: 'PORT=4000' })

  expect(JSON.stringify(write)).toContain('masked placeholder')
  expect(JSON.stringify(edit)).toContain('masked placeholder')
  expect(fine.isError).toBeUndefined()
  expect(written).toEqual(['Edit'])
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
