import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

// National ID numbers, switched on per country by the `countries` option.
export const NATIONAL_IDS: Record<string, RegExp> = {
  IT: /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/gi, // codice fiscale
  US: /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  GB: /\b[A-CEGHJ-PR-TW-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g, // National Insurance number
  ES: /\b(?:\d{8}|[XYZ]\d{7})[A-Z]\b/g, // DNI / NIE
  FR: /\b[12] ?\d{2} ?\d{2} ?(?:\d{2}|2[AB]) ?\d{3} ?\d{3} ?\d{2}\b/g, // NIR (sécurité sociale)
  BR: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, // CPF
  IN: /\b[A-Z]{5}\d{4}[A-Z]\b/g, // PAN (Aadhaar's 12 digits are caught as a number)
  MX: /\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g, // CURP
  CN: /\b\d{17}[\dX]\b/g, // resident identity card
}

// Run before national IDs, so no ID pattern takes a piece of a key.
const SECRETS: [string, RegExp][] = [
  ['key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
  ['key', /(?<=\bBearer\s+)[A-Za-z0-9._~+\/-]{16,}=*/g],
  // A digit, +, / or = sets base64 credentials apart from prose like "Basic Authentication".
  ['key', /(?<=\bBasic\s+)(?=[A-Za-z0-9+\/]*[\d+\/=])[A-Za-z0-9+\/]{8,}=*/g],
  ['key', /\b(?:sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|[rs]k_(?:live|test)_[A-Za-z0-9]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abposre]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|[A-Za-z0-9_-]*(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,})\b/g],
  // The password in scheme://user:password@host.
  ['secret', /(?<=:\/\/[^\s:@\/]*:)[^\s@\/]+(?=@)/g],
  // The value of PASSWORD=…, "api_key": "…", client_secret: …; not env lookups like process.env.X or ${X}.
  // (?<!⟦): the `secret:` label of a placeholder is not an assignment.
  // (?<![a-z])pass: DB_PASS, not bypass or compass.
  ['secret', /(?<=(?<!⟦)(?:passw(?:or)?d|(?<![a-z])pass\b|pwd|secret(?:[_-]?key)?|token|api[_-]?key|access[_-]?key|private[_-]?key)["']?\s*[:=]\s*["']?)(?![$%{(<⟦]|[A-Za-z_]\w*[.([])[^\s"'`,;]{4,}/gi],
]

// Dates, times, IPv4 addresses and build numbers look like phone numbers but are not secret.
// A build has a one-digit group inside (130.0.6723.91); dotted phones do not (06.12.34.56.78, 1.800.555.1234).
const NOT_A_PHONE = /^(?:\d{4}([./-])\d{2}\1\d{2}|\d{1,2}([./-])\d{1,2}\2\d{4})(?: \d{1,2})?$|^\d{1,3}(?:\.\d{1,3}){3}$|^\d+(?:\.\d+)*\.\d(?:\.\d+)+$/

// Git commit hashes, SHA-256 digests and UUIDs fill tool output and are not secret.
const NOT_A_KEY = /^(?:[\da-f]{40}|[\da-f]{64}|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i

// Order matters: IBANs before phones, so their digits are not taken as a number.
const PATTERNS: [string, RegExp][] = [
  // \p{L}/\p{Nd}: international addresses (josé@müller.de) and non-Latin digits (Arabic, Persian, Devanagari).
  ['email', /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu],
  ['bank_account', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g],
  ['card', /(?<!\p{Nd})(?:\p{Nd}[ -]?){13,19}(?!\p{Nd})/gu],
  ['phone', /(?:\+|(?<!\p{Nd})00)?\(?\p{Nd}[\p{Nd} ().\/-]{6,}\p{Nd}(?!\p{Nd})/gu],
]

// Every card number passes the Luhn check; most timestamps and order numbers do not.
const luhn = (digits: number[]) =>
  digits.reverse().reduce((sum, d, i) => sum + (i % 2 ? (d * 2 > 9 ? d * 2 - 9 : d * 2) : d), 0) % 10 === 0

// What the model and the transcript see in place of a secret: its first 3 characters.
const MASK = /⟦(\w+):([^⟧]*)•••⟧/g

// "all", or a list like "IT, us,GB": the countries whose national IDs are masked.
export const countryIds = (countries: string) =>
  countries.trim().toLowerCase() === 'all'
    ? Object.values(NATIONAL_IDS)
    : countries.toUpperCase().split(/[\s,;]+/).flatMap(c => NATIONAL_IDS[c] ?? [])

export const redact = (text: string, ids: RegExp[] = Object.values(NATIONAL_IDS)) =>
  [...SECRETS, ...ids.map(re => ['id', re] as [string, RegExp]), ...PATTERNS].reduce(
    (t, [kind, re]) =>
      t.replace(re, m =>
        // Fewer than 8 digits is a year, a price, a count: left alone.
        ((kind === 'card' || kind === 'phone' || kind === 'bank_account') && (m.match(/\p{Nd}/gu) ?? []).length < 8) ||
        // A long number that fails Luhn is left for the phone pattern, which still masks it.
        (kind === 'card' && !luhn((m.match(/\p{Nd}/gu) ?? []).map(d => +d))) ||
        (kind === 'phone' && NOT_A_PHONE.test(m)) ||
        (kind === 'key' && NOT_A_KEY.test(m))
          ? m
          : `⟦${kind}:${m.slice(0, 3)}•••⟧`,
      ),
    text,
  )

// Every string in a tool's result, but encoded images and PDFs (`base64`, MCP's `data`).
export const redactDeep = (value: unknown, ids?: RegExp[]): unknown =>
  typeof value === 'string'
    ? redact(value, ids)
    : Array.isArray(value)
      ? value.map(v => redactDeep(v, ids))
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, k === 'base64' || k === 'data' ? v : redactDeep(v, ids)]),
          )
        : value

const placeholders = (text: string) => (text.match(MASK) ?? []).length

// The placeholders `after` holds beyond those already in `before`, by kind, in order of appearance.
export const maskedKinds = (before: string, after: string) => {
  const counts: Record<string, number> = {}
  for (const [, kind = ''] of after.matchAll(MASK)) counts[kind] = (counts[kind] ?? 0) + 1
  for (const [, kind = ''] of before.matchAll(MASK)) counts[kind] = (counts[kind] ?? 0) - 1
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0))
}

// Tokyo Night palette; the `color` option picks one.
export const COLORS: Record<string, string> = {
  purple: '#bb9af7',
  blue: '#7aa2f7',
  cyan: '#7dcfff',
  green: '#9ece6a',
  yellow: '#e0af68',
  orange: '#ff9e64',
  red: '#f7768e',
  pink: '#ff79c6',
}

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

// One icon per kind, so the breakdown needs no translation.
const ICONS: Record<string, string> = {
  email: '📧',
  phone: '📞',
  key: '🔑',
  secret: '🔐',
  card: '💳',
  bank_account: '🏦',
  id: '🪪',
}

// "it_IT.UTF-8" / "pt-BR" -> "it" / "pt"; English when unknown.
export const toastText = (locale: string | undefined, kinds: Record<string, number>) =>
  `🔒 ${LABELS[(locale ?? '').toLowerCase().split(/[_.@-]/)[0] ?? ''] ?? LABELS.en}: ${Object.entries(kinds)
    .map(([kind, n]) => `${ICONS[kind] ?? kind} ${n}`)
    .join(' · ')}`

// A toast naming what `after` masked beyond `before`; none when nothing was.
const toast = async ($: EngineInterface, before: string, after: string) => {
  const kinds = maskedKinds(before, after)
  if (Object.keys(kinds).length === 0) return
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  $.ui.toast(toastText(locale, kinds))
}

const isBannerShown = atom({ plugin: 'redact-secrets', key: 'isBannerShown' } as const, false)

export const register: Register = (on, options) => {
  const countries = String(options.countries ?? 'all')
  const color = String(options.color ?? 'purple')
  const ids = countryIds(countries)
  const background = COLORS[color] ?? COLORS.purple

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'redact-secrets', description: 'Show the redact-secrets banner and its settings' })
    // The banner greets once, on the first session after install.
    if (!(await $.store.get('welcomed'))) await update($, isBannerShown, () => true)
    return next(e)
  })

  on('command.run', { command: 'redact-secrets' }, async $ => {
    await update($, isBannerShown, () => true)
    return { text: `redact-secrets: countries ${countries}, color ${color}` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isBannerShown))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Text color="#1a1b26" backgroundColor={background} bold>
          {' ⟦•••⟧ '}
        </Text>
        <Box flexDirection="column">
          <Text>
            <Text bold>redact-secrets</Text>
            <Text dimColor> · countries: {countries} · color: {color}</Text>
          </Text>
          <Text dimColor>Emails, phones, API keys, passwords, cards, IBANs and national IDs are masked before they are sent.</Text>
        </Box>
        <Button
          key="dismiss"
          label="Got it"
          onPress={async () => {
            await $.store.set('welcomed', true)
            await update($, isBannerShown, () => false)
          }}
        />
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command) return next(e)
    const text = redact(e.text, ids)
    await toast($, e.text, text)
    return next({ ...e, text })
  }).catch(($, e, next) =>
    // Fail closed: a prompt that could not be checked is not sent unmasked.
    next.called ? next(e) : { drop: 'redact-secrets could not check this prompt, so it was not sent' },
  )

  // What a tool read or printed (a file, a command's output, a web page) reaches the model masked too.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const before = JSON.stringify(ran.result) ?? ''
    const result = redactDeep(ran.result, ids)
    const after = JSON.stringify(result) ?? ''
    if (after === before) return ran
    await toast($, before, after)
    return { result, context: ran.context }
  }).catch(() =>
    // Fail closed: the tool has run, but output that could not be checked is withheld.
    ({ deny: 'redact-secrets could not check this output, so it was withheld' }),
  )

  // A placeholder is not the value it hides: writing one into a file would replace a real secret.
  const guard = (path: string, before: string, after: string) =>
    placeholders(after) > placeholders(before)
      ? {
          deny:
            `redact-secrets: this would write a masked placeholder (⟦…•••⟧) into ${path}, ` +
            'destroying the real value it stands for. Leave those lines untouched, or ask the user to edit them.',
        }
      : undefined

  on('tool.call', { tool: 'Edit' }, ($, e, next) => guard(e.file_path, e.old_string, e.new_string) ?? next(e)).catch(
    ($, e, next) => (next.called ? next(e) : { deny: 'redact-secrets could not check this edit' }),
  )

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    // A file that exists but cannot be read (permissions, over 4 MiB) cannot be checked: refused.
    const current = (await $.fs.exists(e.file_path)) ? await $.fs.read(e.file_path).catch(() => undefined) : ''
    if (current === undefined) return { deny: 'redact-secrets could not check this write' }
    return guard(e.file_path, current, e.content) ?? next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'redact-secrets could not check this write' }))

  // A shell command can write too (sed -i, echo > .env), and what it touches cannot be known: any placeholder is refused.
  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    placeholders(e.command) > 0
      ? {
          deny:
            'redact-secrets: this command carries a masked placeholder (⟦…•••⟧), which could be written over the real value it ' +
            'stands for. Refer to the value through its file or an environment variable, or ask the user to run the command.',
        }
      : next(e),
  ).catch(($, e, next) => (next.called ? next(e) : { deny: 'redact-secrets could not check this command' }))

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    const text = e.props.text
    if (!text.includes('⟦')) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const parts: RenderChildren[] = []
    let last = 0
    for (const m of text.matchAll(MASK)) {
      parts.push(text.slice(last, m.index))
      parts.push(
        <Text color="#1a1b26" backgroundColor={background} bold>
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
