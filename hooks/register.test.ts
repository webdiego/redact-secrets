import { expect, test } from 'claude-code/testing'
import { countryIds, redact, toastText } from './register'

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
  expect(redact('IT60 X054 2811 1010 0000 0123 456')).toBe('⟦iban:IT6•••⟧')
  expect(redact('DE89 3704 0044 0532 0130 00')).toBe('⟦iban:DE8•••⟧')
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
  // Env lookups and token counts are code, not secrets.
  expect(redact('const apiKey = process.env.API_KEY')).toBe('const apiKey = process.env.API_KEY')
  expect(redact('password: ${DB_PASSWORD}')).toBe('password: ${DB_PASSWORD}')
  expect(redact('max_tokens=4096')).toBe('max_tokens=4096')
})

test('dates, times and IP addresses are not phone numbers', async () => {
  expect(redact('at 2026-10-23 12:30:45')).toBe('at 2026-10-23 12:30:45')
  expect(redact('on 23/10/2026')).toBe('on 23/10/2026')
  expect(redact('host 192.168.100.200')).toBe('host 192.168.100.200')
  // A phone after a date is still masked (its 13 digits read as a card).
  expect(redact('2026-10-23 333 123 4567')).toBe('⟦card:202•••⟧')
})

test('the toast speaks the locale, English otherwise', async () => {
  expect(toastText('it_IT.UTF-8', 2)).toBe("🔒 Dati sensibili oscurati prima dell'invio: 2")
  expect(toastText('ja_JP.UTF-8', 1)).toBe('🔒 送信前に機密データをマスクしました: 1')
  expect(toastText('pt-BR', 3)).toBe('🔒 Dados sensíveis ocultados antes do envio: 3')
  expect(toastText('xx_XX', 1)).toBe('🔒 Sensitive data masked before sending: 1')
  expect(toastText(undefined, 1)).toBe('🔒 Sensitive data masked before sending: 1')
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
