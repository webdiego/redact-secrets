import { expect, test } from 'claude-code/testing'
import { countryIds, maskedKinds, redact, redactDeep, toastText } from './register'

test('masks secrets to their first 3 characters', async () => {
  expect(redact('mail mario.rossi@gmail.com ok')).toBe('mail ⟦email:mar•••⟧ ok')
  expect(redact('mail josé@müller.de')).toBe('mail ⟦email:jos•••⟧')
  expect(redact('tel +39 333 123 4567')).toBe('tel ⟦phone:+39•••⟧')
  expect(redact('call (555) 123-4567')).toBe('call ⟦phone:(55•••⟧')
  expect(redact('ring 020 7946 0958')).toBe('ring ⟦phone:020•••⟧')
  expect(redact('+49 30/1234567')).toBe('⟦phone:+49•••⟧')
  expect(redact('هاتف ٠١٢٣٤٥٦٧٨٩')).toBe('هاتف ⟦phone:٠١٢•••⟧')
  expect(redact('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('key ⟦key:sk-•••⟧')
  expect(redact('carta 4111 1111 1111 1111')).toBe('carta ⟦card:411•••⟧')
  // Fails Luhn: not a card, but still masked as a long number.
  expect(redact('ts 1729958400000')).toBe('ts ⟦phone:172•••⟧')
  expect(redact('IT60 X054 2811 1010 0000 0123 456')).toBe('⟦bank_account:IT6•••⟧')
  expect(redact('DE89 3704 0044 0532 0130 00')).toBe('⟦bank_account:DE8•••⟧')
  expect(redact('ho 3 gatti e 2024 anni')).toBe('ho 3 gatti e 2024 anni')
})

test('masks passwords, credentials in URLs and private keys', async () => {
  expect(redact('PASSWORD=hunter2isgood')).toBe('PASSWORD=⟦secret:hun•••⟧')
  expect(redact('{"api_key": "abc123xyz"}')).toBe('{"api_key": "⟦secret:abc•••⟧"}')
  expect(redact('GITHUB_TOKEN: x9y8z7w6')).toBe('GITHUB_TOKEN: ⟦secret:x9y•••⟧')
  expect(redact('postgres://admin:S3cretPass@localhost:5432/app')).toBe('postgres://admin:⟦secret:S3c•••⟧@localhost:5432/app')
  expect(redact('stripe sk_live_51HxAbCdEfGhIjKlMn')).toBe('stripe ⟦key:sk_•••⟧')
  expect(redact('Authorization: Bearer abc.def-ghi_jkl0123456')).toBe('Authorization: Bearer ⟦key:abc•••⟧')
  expect(redact('-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blbn\nNzaC1r\n-----END OPENSSH PRIVATE KEY-----')).toBe('⟦key:---•••⟧')
  // Split so secret scanners do not take these fakes for real credentials.
  expect(redact('Authorization: Basic ' + 'YWRtaW46aHVudGVyMg==')).toBe('Authorization: Basic ⟦key:YWR•••⟧')
  expect(redact('uses Basic Authentication')).toBe('uses Basic Authentication')
  expect(redact('glpat-' + 'abcdefghij1234567890')).toBe('⟦key:glp•••⟧')
  expect(redact('SG.' + 'abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG')).toBe('⟦key:SG.•••⟧')
  expect(redact('DB_PASS=hunter2')).toBe('DB_PASS=⟦secret:hun•••⟧')
  expect(redact('bypass: everything')).toBe('bypass: everything')
  // Env lookups and token counts are code, not secrets.
  expect(redact('const apiKey = process.env.API_KEY')).toBe('const apiKey = process.env.API_KEY')
  expect(redact('password: ${DB_PASSWORD}')).toBe('password: ${DB_PASSWORD}')
  expect(redact('max_tokens=4096')).toBe('max_tokens=4096')
  // A key after a name is masked once, as a key.
  expect(redact('API_KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('API_KEY=⟦key:sk-•••⟧')
})

test('dates, times and IP addresses are not phone numbers', async () => {
  expect(redact('at 2026-10-23 12:30:45')).toBe('at 2026-10-23 12:30:45')
  expect(redact('on 23/10/2026')).toBe('on 23/10/2026')
  expect(redact('host 192.168.100.200')).toBe('host 192.168.100.200')
  // A phone after a date is still masked, the date with it.
  expect(redact('2026-10-23 333 123 4567')).toBe('⟦phone:202•••⟧')
})

test('the toast speaks the locale, English otherwise, with one icon per kind', async () => {
  expect(toastText('it_IT.UTF-8', { email: 2 })).toBe("🔒 Dati sensibili oscurati prima dell'invio: 📧 2")
  expect(toastText('ja_JP.UTF-8', { key: 1 })).toBe('🔒 送信前に機密データをマスクしました: 🔑 1')
  expect(toastText('pt-BR', { email: 2, phone: 1 })).toBe('🔒 Dados sensíveis ocultados antes do envio: 📧 2 · 📞 1')
  expect(toastText('xx_XX', { card: 1 })).toBe('🔒 Sensitive data masked before sending: 💳 1')
  expect(toastText(undefined, { id: 1 })).toBe('🔒 Sensitive data masked before sending: 🪪 1')
})

test('counts only the placeholders that are new, by kind', async () => {
  expect(maskedKinds('a ⟦key:sk-•••⟧', 'a ⟦key:sk-•••⟧ ⟦email:mar•••⟧ ⟦email:jos•••⟧')).toEqual({ email: 2 })
  expect(maskedKinds('x', 'x')).toEqual({})
})

test('commit hashes, digests and UUIDs are not keys', async () => {
  expect(redact('commit 625f2dc1a2b3c4d5e6f708192a3b4c5d6e7f8091')).toBe('commit 625f2dc1a2b3c4d5e6f708192a3b4c5d6e7f8091')
  expect(redact('session 4474e912-ce74-4875-9ab3-c027f9c05c30')).toBe('session 4474e912-ce74-4875-9ab3-c027f9c05c30')
})

test('masks every string of a tool result but encoded files', async () => {
  const image = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'
  expect(
    redactDeep({ file: { content: 'KEY=sk-ant-api03-abcdefghijklmnopqrstuvwxyz', numLines: 1, base64: image }, parts: [{ data: image }, 'a.b@c.io'] }),
  ).toEqual({ file: { content: 'KEY=⟦key:sk-•••⟧', numLines: 1, base64: image }, parts: [{ data: image }, '⟦email:a.b•••⟧'] })
})

test('masks national ID numbers', async () => {
  expect(redact('cf RSSMRA85T10A562S')).toBe('cf ⟦id:RSS•••⟧')
  expect(redact('ssn 123-45-6789')).toBe('ssn ⟦id:123•••⟧')
  expect(redact('nino AB 12 34 56 C')).toBe('nino ⟦id:AB •••⟧')
  expect(redact('dni 12345678Z')).toBe('dni ⟦id:123•••⟧')
  expect(redact('nir 1 85 05 78 006 084 36')).toBe('nir ⟦id:1 8•••⟧')
  expect(redact('cpf 123.456.789-09')).toBe('cpf ⟦id:123•••⟧')
  expect(redact('pan ABCDE1234F')).toBe('pan ⟦id:ABC•••⟧')
  expect(redact('curp GODE561231HDFRRN09')).toBe('curp ⟦id:GOD•••⟧')
  expect(redact('id 11010519491231002X')).toBe('id ⟦id:110•••⟧')
})

test('only the chosen countries mask their national IDs', async () => {
  const text = 'cf RSSMRA85T10A562S pan ABCDE1234F'
  expect(redact(text, countryIds('IT'))).toBe('cf ⟦id:RSS•••⟧ pan ABCDE1234F')
  expect(redact(text, countryIds(' in , gb'))).toBe('cf RSSMRA85T10A562S pan ⟦id:ABC•••⟧')
  expect(redact(text, countryIds('all'))).toBe('cf ⟦id:RSS•••⟧ pan ⟦id:ABC•••⟧')
  // An ID made only of digits is still masked as a number when its country is off.
  expect(redact('ssn 123-45-6789', countryIds('IT'))).toBe('ssn ⟦phone:123•••⟧')
  expect(countryIds('XX')).toEqual([])
  // Universal kinds stay on whatever the countries.
  expect(redact('mail a.b@c.io', countryIds('XX'))).toBe('mail ⟦email:a.b•••⟧')
})
