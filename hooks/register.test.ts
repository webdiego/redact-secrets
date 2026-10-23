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
