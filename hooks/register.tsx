import type { Register } from 'claude-code'

// Order matters: keys and IBANs before phones, so their digits are not taken as a number.
const PATTERNS: [string, RegExp][] = [
  ['key', /\b(?:sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abposr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|[A-Za-z0-9_-]*(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,})\b/g],
  // \p{L}/\p{Nd}: international addresses (josé@müller.de) and non-Latin digits (Arabic, Persian, Devanagari).
  ['email', /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu],
  ['iban', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g],
  ['card', /(?<!\p{Nd})(?:\p{Nd}[ -]?){13,19}(?!\p{Nd})/gu],
  ['phone', /(?:\+|(?<!\p{Nd})00)?\(?\p{Nd}[\p{Nd} ().\/-]{6,}\p{Nd}(?!\p{Nd})/gu],
]

// What the model and the transcript see in place of a secret: its first 3 characters.
const MASK = /⟦(\w+):([^⟧]*)•••⟧/g

export const redact = (text: string) =>
  PATTERNS.reduce(
    (t, [kind, re]) =>
      t.replace(re, m => ((m.match(/\p{Nd}/gu) ?? []).length < 8 && kind !== 'email' && kind !== 'key' ? m : `⟦${kind}:${m.slice(0, 3)}•••⟧`)),
    text,
  )

// One neutral "label: n" form per language, so no plural rules are needed.
const LABELS: Record<string, string> = {
  en: 'Sensitive data masked before sending',
  it: 'Dati sensibili oscurati prima dell\'invio',
  es: 'Datos sensibles ocultados antes de enviar',
  pt: 'Dados sensíveis ocultados antes do envio',
  fr: 'Données sensibles masquées avant l\'envoi',
  de: 'Sensible Daten vor dem Senden maskiert',
  nl: 'Gevoelige gegevens gemaskeerd vóór verzending',
  sv: 'Känsliga uppgifter maskerade före sändning',
  da: 'Følsomme data maskeret før afsendelse',
  no: 'Sensitive data maskert før sending',
  nb: 'Sensitive data maskert før sending',
  fi: 'Arkaluonteiset tiedot peitetty ennen lähetystä',
  pl: 'Dane wrażliwe ukryte przed wysłaniem',
  cs: 'Citlivé údaje skryty před odesláním',
  ro: 'Date sensibile mascate înainte de trimitere',
  hu: 'Érzékeny adatok elrejtve küldés előtt',
  el: 'Ευαίσθητα δεδομένα αποκρύφθηκαν πριν την αποστολή',
  ru: 'Конфиденциальные данные скрыты перед отправкой',
  uk: 'Конфіденційні дані приховано перед надсиланням',
  tr: 'Hassas veriler gönderilmeden önce gizlendi',
  ar: 'تم إخفاء البيانات الحساسة قبل الإرسال',
  he: 'מידע רגיש הוסתר לפני השליחה',
  fa: 'داده‌های حساس پیش از ارسال پنهان شدند',
  hi: 'भेजने से पहले संवेदनशील डेटा छिपाया गया',
  bn: 'পাঠানোর আগে সংবেদনশীল তথ্য লুকানো হয়েছে',
  ur: 'بھیجنے سے پہلے حساس ڈیٹا چھپا دیا گیا',
  zh: '发送前已隐藏敏感数据',
  ja: '送信前に機密データをマスクしました',
  ko: '전송 전에 민감한 데이터를 가렸습니다',
  id: 'Data sensitif disamarkan sebelum dikirim',
  ms: 'Data sensitif disembunyikan sebelum dihantar',
  vi: 'Đã ẩn dữ liệu nhạy cảm trước khi gửi',
  th: 'ซ่อนข้อมูลที่ละเอียดอ่อนก่อนส่งแล้ว',
  tl: 'Itinago ang sensitibong data bago ipadala',
  sw: 'Data nyeti imefichwa kabla ya kutuma',
}

// "it_IT.UTF-8" / "pt-BR" -> "it" / "pt"; English when unknown.
export const toastText = (locale: string | undefined, count: number) =>
  `🔒 ${LABELS[(locale ?? '').toLowerCase().split(/[_.@-]/)[0]] ?? LABELS.en}: ${count}`

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.command) return next(e)
    const text = redact(e.text)
    const count = (text.match(MASK) ?? []).length - (e.text.match(MASK) ?? []).length
    if (count > 0) {
      const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
      $.ui.toast(toastText(locale, count))
    }
    return next({ ...e, text })
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const text = e.props.text
    if (!text.includes('⟦')) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const parts: unknown[] = []
    let last = 0
    for (const m of text.matchAll(MASK)) {
      parts.push(text.slice(last, m.index))
      parts.push(
        <Text color="#1a1b26" backgroundColor="#bb9af7" bold>
          {` 🔒 ${m[2]}••• `}
        </Text>,
      )
      last = m.index! + m[0].length
    }
    parts.push(text.slice(last))

    return (
      <Box>
        <Text>
          <Text dimColor>{'> '}</Text>
          {parts}
        </Text>
      </Box>
    )
  })
}
