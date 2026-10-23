import { expect, test } from 'claude-code/testing'
import { redact, toastText } from './register'

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
