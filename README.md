<p align="center">
  <img src="docs/banner.svg" alt="redact-secrets: mask sensitive data before it leaves your prompt" width="100%">
</p>

# redact-secrets

> A Claude Code mod that masks sensitive data in your prompts **before they leave your machine**.

Emails, phone numbers, API keys, passwords, credit card numbers, IBANs and national ID numbers typed (or pasted) into the Claude Code prompt, or found in what Claude's tools read and print (files, command output, web pages), are replaced with a short placeholder that keeps only their first 3 characters. The model never receives the full value. In your transcript the masked value is highlighted, and a toast tells you what was masked, in your system language.

![Masked values highlighted in the Claude Code transcript, with the toast counting them](docs/transcript.svg)

```
you type:     write to mario.rossi@gmail.com, tel +39 333 123 4567, my tax code is RSSMRA85T10A562S
model reads:  write to ⟦email:mar•••⟧, tel ⟦phone:+39•••⟧, my tax code is ⟦id:RSS•••⟧
toast:        🔒 Sensitive data masked before sending: 📧 1 · 📞 1 · 🪪 1
```

> The images in this README are illustrations of the mod's output, drawn with the exact colors and text it uses; they are not screen captures.

---

## Table of contents

- [Why](#why)
- [Install](#install)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [What is detected](#what-is-detected)
- [The placeholder format](#the-placeholder-format)
- [Transcript styling](#transcript-styling)
- [The banner in the CLI](#the-banner-in-the-cli)
- [Toast and languages](#toast-and-languages)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Coverage](#coverage)
- [Development](#development)
- [Customizing](#customizing)
- [Limits and known trade-offs](#limits-and-known-trade-offs)
- [FAQ](#faq)
- [License](#license)

---

## Why

It is easy to paste a log, a `.env` line, a customer email or a stack trace containing a phone number into a prompt without noticing. Once sent, that data is part of the conversation. This mod works as a last safety net: it runs locally, inside Claude Code, on the exact text that is about to be submitted, and rewrites it before it enters the session.

It needs no network, no external service and no configuration.

---

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install redact-secrets --marketplace webdiego/redact-secrets
```

What you will see:

1. `Add marketplace?` naming `github:webdiego/redact-secrets`: answer `y`.
2. The plugin's details and a choice of scope: pick **user** (applies to every session) with Enter.
3. A screen asking for the two [options](#configuration): which **countries** to cover and the **highlight color**. Press Enter on each to keep the defaults (`all`, `purple`).
4. `Installed redact-secrets. Plugin is now active.` The mod runs immediately, no restart needed.

From a shell:

```
claude plugin install redact-secrets --marketplace webdiego/redact-secrets
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `webdiego/redact-secrets`, then **Add plugin**.

To remove it, from a shell:

```
claude plugin uninstall redact-secrets
```

---

## Configuration

At install time Claude Code asks for two options. Both can be changed later from `/config`, and the mod reloads with the new values right away.

![The options screen shown at install](docs/install.svg)

| Option | Type | Default | What it does |
|--------|------|---------|--------------|
| `countries` | text | `all` | Which countries' **national ID numbers** are masked: `all`, or ISO 3166 codes separated by commas, spaces or semicolons, in any case (`IT, US, GB`). Unknown codes are ignored. |
| `color` | picker | `purple` | Background of the masked values in the transcript. |

### Countries

Emails, phone numbers, API keys, credit cards and IBANs are **always masked, for every country**: their formats are universal. The `countries` option adds the national ID formats below.

| Code | Country | Document | Example |
|------|---------|----------|---------|
| `IT` | 🇮🇹 Italy | Codice fiscale | `RSSMRA85T10A562S` |
| `US` | 🇺🇸 United States | Social Security Number | `123-45-6789` |
| `GB` | 🇬🇧 United Kingdom | National Insurance number | `AB 12 34 56 C` |
| `ES` | 🇪🇸 Spain | DNI / NIE | `12345678Z`, `X1234567L` |
| `FR` | 🇫🇷 France | NIR (numéro de sécurité sociale) | `1 85 05 78 006 084 36` |
| `BR` | 🇧🇷 Brazil | CPF | `123.456.789-09` |
| `IN` | 🇮🇳 India | PAN | `ABCDE1234F` |
| `MX` | 🇲🇽 Mexico | CURP | `GODE561231HDFRRN09` |
| `CN` | 🇨🇳 China | Resident identity card | `11010519491231002X` |

An ID made only of digits (a US SSN, a French NIR, a Chinese ID) is long enough to still be caught as a number when its country is switched off; it is then labelled `phone` or `card` instead of `id`. IDs with letters (codice fiscale, PAN, CURP, …) are masked only when their country is on.

### Colors

![The eight highlight colors](docs/colors.svg)

| Value | Hex |
|-------|-----|
| `purple` *(default)* | `#bb9af7` |
| `blue` | `#7aa2f7` |
| `cyan` | `#7dcfff` |
| `green` | `#9ece6a` |
| `yellow` | `#e0af68` |
| `orange` | `#ff9e64` |
| `red` | `#f7768e` |
| `pink` | `#ff79c6` |

The palette is Tokyo Night's; the text on the chip is always dark (`#1a1b26`) for contrast.

### Setting the options by hand

Options live in `~/.claude/settings.json` under `pluginConfigs`:

```json
{
  "pluginConfigs": {
    "redact-secrets": {
      "options": { "countries": "IT, ES", "color": "green" }
    }
  }
}
```

---

## How it works

The mod is a single hooks module, [`hooks/register.tsx`](hooks/register.tsx). Four hooks do the work: `prompt.submit`, `tool.call` (output masking, and a guard on `Edit` and `Write`) and `ui.render` on `UserMessage`; three more draw [the banner](#the-banner-in-the-cli) (`session.start`, `command.run`, `ui.render` on `AbovePrompt`). When it loads, it reads its two options once: `countries` becomes the list of national ID patterns to apply, `color` the chip's background.

### 1. `prompt.submit`: masking

Fires after you press Enter and before the prompt enters the session.

1. Slash commands (`/compact`, `/review ...`) are passed through untouched.
2. The text goes through `redact()`, which applies the chosen national ID patterns first, then each universal pattern in a fixed order (see below).
3. The new placeholders are counted by kind. Placeholders you typed yourself are subtracted, so they are never counted twice.
4. If at least one value was masked, a toast is raised in your locale.
5. The rewritten text is handed on with `next({ ...e, text })`. From here on, the engine, the model, the stored transcript and any other plugin see only the masked version.
6. **Fail closed.** If the hook ever throws before handing the prompt on, its `.catch` drops the prompt with the message *"redact-secrets could not check this prompt, so it was not sent"*: an unchecked prompt is never sent unmasked.

### 2. `tool.call`: masking what tools return

Fires around every tool call (Read, Bash, Grep, WebFetch, MCP tools, …), after the tool has run and before the model reads its result.

1. Errors and refused calls are passed through untouched.
2. Every string in the result goes through `redactDeep()`, which runs `redact()` on each one. Encoded images and PDFs (`base64`, MCP's `data`) are skipped, so they stay intact.
3. If nothing changed, the tool's own result is handed on as is. Otherwise the masked result is, and the same toast as for prompts is raised.
4. **Fail closed.** If masking throws, the output is withheld from the model: the tool has run, but its unchecked output is never read.

### 3. `tool.call` on `Edit` and `Write`: the placeholder guard

Once a `.env` has been read masked, Claude sees `API_KEY=⟦key:sk-•••⟧`. Written back, that placeholder would replace the real key on disk. So an `Edit` whose `new_string`, or a `Write` whose `content`, holds more placeholders than the text it replaces (`old_string`, or the current file) is refused, and the model is told to leave those lines alone or ask you. Edits that keep placeholders as they were, like this README's own examples, pass.

### 4. `ui.render` on `UserMessage`: styling

Fires when the transcript draws one of your messages.

- If the message contains no `⟦…⟧` placeholder, the hook calls `next(e)` and the engine draws the row as usual.
- Otherwise it draws the row itself: a dim `> ` prefix, the plain text, and every placeholder replaced by a highlighted ` 🔒 abc••• ` chip.

```
          you press Enter
                 │
                 ▼
   ┌───────────────────────────┐
   │ prompt.submit (this mod)  │  redact() → count → toast
   └─────────────┬─────────────┘
                 │ masked text only
                 ▼
   ┌───────────────────────────┐
   │ Claude Code engine        │  stores message, sends to model
   └─────────────┬─────────────┘
                 │
                 ▼
   ┌───────────────────────────┐
   │ ui.render UserMessage     │  draws ⟦…⟧ as purple chips
   └───────────────────────────┘
```

---

## What is detected

Patterns run in this order. The order matters: keys and secrets come first, so no ID pattern takes a piece of a key; national IDs and IBANs come before phones and cards, so their digits are not later taken as a number.

| # | Kind | What matches | Examples |
|---|------|--------------|----------|
| 0 | `key` | Private key blocks `-----BEGIN … PRIVATE KEY-----` … `-----END … PRIVATE KEY-----` (whole block); `Bearer` tokens; `Basic` credentials (base64) | `Bearer abc.def…` → `Bearer ⟦key:abc•••⟧` |
| 0 | `secret` | The password in `scheme://user:password@host`; the value after a name ending in `password`, `passwd`, `pass` (as a whole word: `DB_PASS`, not `bypass`), `pwd`, `secret`, `secret_key`, `token`, `api_key`, `access_key`, `private_key` and `=` or `:` (not env lookups like `process.env.X`, `${X}`) | `PASSWORD=hunter2` → `PASSWORD=⟦secret:hun•••⟧` |
| 0 | `id` | The national ID formats of the countries chosen in the [`countries` option](#countries) | `RSSMRA85T10A562S` → `⟦id:RSS•••⟧` |
| 1 | `key` | OpenAI / Anthropic `sk-…`, `sk-ant-…`; Stripe `sk_live_…`, `rk_test_…`; GitHub `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_…`; GitLab `glpat-…`; SendGrid `SG.….…`; AWS `AKIA…`, `ASIA…`; Google `AIza…`; Slack `xoxb-`, `xoxp-`, `xoxe-`, …; JWTs `eyJ….….…`; any 32+ character token that mixes letters and digits | `sk-ant-api03-…` → `⟦key:sk-•••⟧` |
| 2 | `email` | Any `local@domain.tld`, Unicode letters included | `josé@müller.de` → `⟦email:jos•••⟧` |
| 3 | `bank_account` | IBAN: 2 letters + 2 digits + 3–7 groups of 4, spaces optional (all countries) | `DE89 3704 0044 0532 0130 00` → `⟦bank_account:DE8•••⟧` |
| 4 | `card` | 13–19 digits, spaces or dashes allowed, passing the Luhn check (others fall to `phone`) | `4111 1111 1111 1111` → `⟦card:411•••⟧` |
| 5 | `phone` | Optional `+` or `00` prefix, optional `(`, then digits with spaces, `()`, `.`, `/`, `-`, **at least 8 digits in total** | `+39 333 123 4567`, `(555) 123-4567`, `020 7946 0958`, `+49 30/1234567` |

**International digits.** Phone and card patterns use Unicode decimal digits (`\p{Nd}`), so Arabic-Indic (`٠١٢٣`), Persian (`۰۱۲۳`), Devanagari (`०१२३`) and other native numerals are detected like Latin ones.

**The 8-digit floor.** For `phone`, `card` and `bank_account`, a match with fewer than 8 digits is left alone. This keeps years (`2024`), prices, versions, ports and short counts out of the mask.

**Not phones.** Dates (`2026-10-23 12:30`, `23/10/2026`) and IPv4 addresses (`192.168.1.20`) are left alone, so pasted logs stay readable.

---

## The placeholder format

```
⟦<kind>:<first 3 characters>•••⟧
```

- `⟦` and `⟧` (U+27E6 / U+27E7) are rare enough to never collide with normal prose or code.
- `<kind>` tells the model what was there (`email`, `phone`, `key`, `secret`, `card`, `bank_account`, `id`), so it can still reason about the prompt ("send the invoice to ⟦email:mar•••⟧").
- The 3 visible characters let **you** recognise which value was masked when several are in the same prompt.

---

## Transcript styling

Each placeholder is drawn as:

```tsx
<Text color="#1a1b26" backgroundColor={background} bold>{` 🔒 ${prefix}••• `}</Text>
```

`background` is the hex of the [`color` option](#colors), purple by default. Terminals without true-color support fall back to the nearest available color.

---

## The banner in the CLI

The first time Claude Code starts with the mod installed, a band above the prompt introduces it and shows the active settings:

```
 ⟦•••⟧  redact-secrets · countries: all · color: purple                    [ Got it ]
        Emails, phones, API keys, passwords, cards, IBANs and national IDs are masked before they are sent.
```

The `⟦•••⟧` mark is drawn in your highlight color. **Got it** dismisses it for good (remembered across sessions). Type `/redact-secrets` at any time to bring it back and print the current settings.

### Logo

<img src="docs/logo.svg" alt="redact-secrets logo" width="120">

The logo is the placeholder itself: the `⟦ ⟧` brackets around the `•••` that replace a secret, in the Tokyo Night purple-to-blue. `docs/logo.svg` is the source; `.claude-plugin/icon.png` (1024×1024) is the plugin's icon.

---

## Toast and languages

The toast reads `🔒 <label>: <icon> <count> · <icon> <count>`, one icon per kind: 📧 email, 📞 phone, 🔑 key, 🔐 secret, 💳 card, 🏦 bank_account, 🪪 id. Icons and the neutral `label: count` form need no translation and avoid plural rules, which differ widely between languages (Polish, Russian, Arabic, …).

The language comes from the environment, in POSIX order: `LC_ALL`, then `LC_MESSAGES`, then `LANG`. Only the language part is used (`it_IT.UTF-8` → `it`, `pt-BR` → `pt`). Unknown or unset falls back to English.

| Code | Language | Code | Language | Code | Language |
|------|----------|------|----------|------|----------|
| `en` | English | `cs` | Czech | `bn` | Bengali |
| `it` | Italian | `ro` | Romanian | `ur` | Urdu |
| `es` | Spanish | `hu` | Hungarian | `zh` | Chinese |
| `pt` | Portuguese | `el` | Greek | `ja` | Japanese |
| `fr` | French | `ru` | Russian | `ko` | Korean |
| `de` | German | `uk` | Ukrainian | `id` | Indonesian |
| `nl` | Dutch | `tr` | Turkish | `ms` | Malay |
| `sv` | Swedish | `ar` | Arabic | `vi` | Vietnamese |
| `da` | Danish | `he` | Hebrew | `th` | Thai |
| `no` / `nb` | Norwegian | `fa` | Persian | `tl` | Filipino |
| `fi` | Finnish | `hi` | Hindi | `sw` | Swahili |
| `pl` | Polish | | | | |

Translations were written by the author, not reviewed by native speakers. Corrections are welcome.

---

## Project structure

```
redact-secrets/
├── .claude-plugin/
│   ├── plugin.json          # mod manifest: name, version, options (userConfig), icon
│   ├── icon.png             # 1024×1024 plugin icon
│   └── marketplace.json     # makes this repo installable with one line
├── hooks/
│   ├── hooks.json           # points the engine at register.tsx
│   ├── register.tsx         # the mod: patterns, redact(), countryIds(), toastText(), hooks
│   ├── register.test.ts     # unit tests for the pure functions
│   └── hooks.test.tsx       # integration tests through the real hook chain
├── docs/                    # logo, banner and README illustrations (SVG)
├── types/
│   └── index.d.ts           # state contract: the banner's isBannerShown flag
├── tsconfig.json            # extends the types the engine writes on load
├── LICENSE
└── README.md
```

`register.tsx` exports pure functions and tables so they can be tested on their own:

- `redact(text: string, ids?: RegExp[]): string`: masks `text`; `ids` defaults to every country
- `countryIds(countries: string): RegExp[]`: turns the `countries` option into patterns
- `redactDeep(value: unknown, ids?: RegExp[]): unknown`: masks every string in a tool result but encoded files
- `maskedKinds(before: string, after: string): Record<string, number>`: the new placeholders, by kind
- `toastText(locale: string | undefined, kinds: Record<string, number>): string`
- `NATIONAL_IDS`, `COLORS`: the country and color tables

---

## Tests

Run them with:

```
claude plugin test .
```

The runner executes every `*.test.ts` / `*.test.tsx` in an environment like the one the mod's hooks run in. Tests import their kit from `claude-code/testing`. Nothing sits beneath the mod in a test: small hooks registered with `on(...)` stand in for the engine (answering `env.get`, capturing `ui.toast`, echoing `prompt.submit`).

Current result:

```
hooks/hooks.test.tsx:
(pass) a prompt reaches the engine masked, with a counted toast in the locale
(pass) a prompt with nothing sensitive passes unchanged and raises no toast
(pass) what a tool prints reaches the model masked
(pass) output that cannot be checked is withheld, never passed on unmasked
(pass) a write whose target cannot be read is refused before it runs
(pass) a placeholder is never written over a real value
(pass) a masked value is drawn highlighted in the transcript, on every surface
(pass) a message with nothing masked is left to the engine
(pass) the countries option limits which national IDs are masked
(pass) the color option paints the highlight
(pass) the banner greets on the first session and stays away once dismissed
(pass) /redact-secrets brings the banner back with the settings

hooks/register.test.ts:
(pass) masks secrets to their first 3 characters
(pass) masks passwords, credentials in URLs and private keys
(pass) dates, times and IP addresses are not phone numbers
(pass) the toast speaks the locale, English otherwise, with one icon per kind
(pass) counts only the placeholders that are new, by kind
(pass) commit hashes, digests and UUIDs are not keys
(pass) masks every string of a tool result but encoded files
(pass) masks national ID numbers
(pass) only the chosen countries mask their national IDs

 21 pass
 0 fail
```

### `hooks/register.test.ts`: unit tests

**`masks secrets to their first 3 characters`** checks `redact()` input by input:

| Input | Expected | Checks |
|-------|----------|--------|
| `mail mario.rossi@gmail.com ok` | `mail ⟦email:mar•••⟧ ok` | plain email, surrounding text kept |
| `mail josé@müller.de` | `mail ⟦email:jos•••⟧` | Unicode email |
| `tel +39 333 123 4567` | `tel ⟦phone:+39•••⟧` | Italian mobile, `+` prefix |
| `call (555) 123-4567` | `call ⟦phone:(55•••⟧` | US format with parentheses |
| `ring 020 7946 0958` | `ring ⟦phone:020•••⟧` | UK landline |
| `+49 30/1234567` | `⟦phone:+49•••⟧` | German format with `/` |
| `هاتف ٠١٢٣٤٥٦٧٨٩` | `هاتف ⟦phone:٠١٢•••⟧` | Arabic-Indic digits |
| `key sk-ant-api03-abc…xyz` | `key ⟦key:sk-•••⟧` | Anthropic API key |
| `carta 4111 1111 1111 1111` | `carta ⟦card:411•••⟧` | card number with spaces |
| `ts 1729958400000` | `ts ⟦phone:172•••⟧` | fails Luhn: not a card, still masked |
| `IT60 X054 2811 1010 0000 0123 456` | `⟦bank_account:IT6•••⟧` | Italian IBAN |
| `DE89 3704 0044 0532 0130 00` | `⟦bank_account:DE8•••⟧` | German IBAN |
| `ho 3 gatti e 2024 anni` | *(unchanged)* | short numbers are **not** masked |

**`masks passwords, credentials in URLs and private keys`** checks the `secret` kind and the newer key formats:

| Input | Expected | Checks |
|-------|----------|--------|
| `PASSWORD=hunter2isgood` | `PASSWORD=⟦secret:hun•••⟧` | `.env` assignment |
| `{"api_key": "abc123xyz"}` | `{"api_key": "⟦secret:abc•••⟧"}` | JSON, quotes kept |
| `GITHUB_TOKEN: x9y8z7w6` | `GITHUB_TOKEN: ⟦secret:x9y•••⟧` | YAML style |
| `postgres://admin:S3cretPass@localhost:5432/app` | `postgres://admin:⟦secret:S3c•••⟧@localhost:5432/app` | password in a URL, user and host kept |
| `stripe sk_live_51HxAbCdEfGhIjKlMn` | `stripe ⟦key:sk_•••⟧` | Stripe key |
| `Authorization: Bearer abc.def-ghi_jkl0123456` | `Authorization: Bearer ⟦key:abc•••⟧` | Bearer token |
| `Authorization: Basic YWRtaW46aHVudGVyMg==` | `Authorization: Basic ⟦key:YWR•••⟧` | Basic credentials |
| `uses Basic Authentication` | *(unchanged)* | prose, not base64 |
| `glpat-abcdefghij…` | `⟦key:glp•••⟧` | GitLab token, whole |
| `SG.abcdefghijklmnopqrstuv.abcd…` | `⟦key:SG.•••⟧` | SendGrid key, both parts |
| `DB_PASS=hunter2` | `DB_PASS=⟦secret:hun•••⟧` | `pass` as a name |
| `bypass: everything` | *(unchanged)* | `pass` inside a word |
| `-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END …-----` | `⟦key:---•••⟧` | whole multi-line block |
| `const apiKey = process.env.API_KEY` | *(unchanged)* | env lookups are code |
| `password: ${DB_PASSWORD}` | *(unchanged)* | template variables are code |
| `max_tokens=4096` | *(unchanged)* | the name must end with the keyword |

**`dates, times and IP addresses are not phone numbers`**:

| Input | Expected | Checks |
|-------|----------|--------|
| `at 2026-10-23 12:30:45` | *(unchanged)* | ISO date and time |
| `on 23/10/2026` | *(unchanged)* | European date |
| `host 192.168.100.200` | *(unchanged)* | IPv4 |
| `2026-10-23 333 123 4567` | `⟦phone:202•••⟧` | a number after a date is still masked |

**`the toast speaks the locale, English otherwise, with one icon per kind`** checks `toastText()`:

| Locale | Expected |
|--------|----------|
| `it_IT.UTF-8` | `🔒 Dati sensibili oscurati prima dell'invio: 📧 2` |
| `ja_JP.UTF-8` | `🔒 送信前に機密データをマスクしました: 🔑 1` |
| `pt-BR` | `🔒 Dados sensíveis ocultados antes do envio: 📧 2 · 📞 1` |
| `xx_XX` | English fallback |
| `undefined` | English fallback |

**`masks national ID numbers`** checks one ID per country, with every country on:

| Input | Expected | Country |
|-------|----------|---------|
| `cf RSSMRA85T10A562S` | `cf ⟦id:RSS•••⟧` | 🇮🇹 codice fiscale |
| `ssn 123-45-6789` | `ssn ⟦id:123•••⟧` | 🇺🇸 SSN |
| `nino AB 12 34 56 C` | `nino ⟦id:AB •••⟧` | 🇬🇧 NINO |
| `dni 12345678Z` | `dni ⟦id:123•••⟧` | 🇪🇸 DNI |
| `nir 1 85 05 78 006 084 36` | `nir ⟦id:1 8•••⟧` | 🇫🇷 NIR |
| `cpf 123.456.789-09` | `cpf ⟦id:123•••⟧` | 🇧🇷 CPF |
| `pan ABCDE1234F` | `pan ⟦id:ABC•••⟧` | 🇮🇳 PAN |
| `curp GODE561231HDFRRN09` | `curp ⟦id:GOD•••⟧` | 🇲🇽 CURP |
| `id 11010519491231002X` | `id ⟦id:110•••⟧` | 🇨🇳 resident ID |

**`only the chosen countries mask their national IDs`** checks `countryIds()` with `redact()`:

| `countries` | Input | Expected | Checks |
|-------------|-------|----------|--------|
| `IT` | `cf RSSMRA85T10A562S pan ABCDE1234F` | only the codice fiscale masked | one country |
| ` in , gb` | same | only the PAN masked | spaces, lowercase, list |
| `all` | same | both masked | the keyword |
| `XX` | — | no patterns | unknown code ignored |
| `XX` | `mail a.b@c.io` | email masked | universal kinds always on |
| `IT` | `ssn 123-45-6789` | `⟦phone:123•••⟧` | digit-only IDs still caught as numbers |

### `hooks/hooks.test.tsx`: integration tests

These run the real hooks through the engine's event chain, not just the helper functions.

| Test | Setup | Asserts |
|------|-------|---------|
| **a prompt reaches the engine masked, with a counted toast in the locale** | `LANG=it_IT.UTF-8`; submits a prompt with an email and a phone | the text that reaches the engine is masked; exactly one toast, in Italian, reading `📧 1 · 📞 1` |
| **a prompt with nothing sensitive passes unchanged and raises no toast** | no locale; submits `refactor the login page` | text unchanged; no toast at all |
| **what a tool prints reaches the model masked** | a `Bash` call whose stdout is `API_KEY=sk-ant-…` | the result reaching the model reads `API_KEY=⟦key:sk-•••⟧` |
| **a placeholder is never written over a real value** | a `.env` holding a real key; a `Write` and an `Edit` adding placeholders, then a plain `Edit` | the first two are refused and never reach the tool; the plain edit runs |
| **output that cannot be checked is withheld, never passed on unmasked** | a `Bash` result holding a key and a `BigInt`, which makes masking throw | the call is refused with *could not check this output*; the key appears nowhere in what comes back |
| **a write whose target cannot be read is refused before it runs** | `fs.read` fails on an existing file; a `Write` to it | refused with *could not check this write*; the tool never runs |
| **a masked value is drawn highlighted in the transcript, on every surface** | mounts a `UserMessage` row with a placeholder on `terminal`, `desktop`, `vscode` and `mobile` | the row draws `> mail  🔒 mar•••  ok` |
| **a message with nothing masked is left to the engine** | mounts a `UserMessage` row with plain text | the mod calls `next(e)` and the engine's own drawing is shown |
| **the countries option limits which national IDs are masked** | option `countries: 'IT'`; submits a codice fiscale and a PAN | only the codice fiscale reaches the engine masked |
| **the color option paints the highlight** | option `color: 'green'`; mounts a row with a placeholder | the chip's `backgroundColor` is `#9ece6a` |

| **the banner greets on the first session and stays away once dismissed** | empty store; starts a session; mounts the band | the band shows the settings; pressing **Got it** stores `welcomed: true` and the band gives way to the engine |
| **/redact-secrets brings the banner back with the settings** | `welcomed` already stored; options `IT`, `green`; runs the command | the command answers `countries IT, color green` and the band is shown again |

Options are passed with `test(name, { options }, body)`, which the kit reads exactly as values stored in settings.

---

## Coverage

`claude plugin test` has no automatic coverage report, so coverage is tracked by hand against the code paths in `register.tsx`.

### Code paths

| Path in `register.tsx` | Covered by | Status |
|---|---|---|
| `redact()`: `key` pattern (Anthropic `sk-ant-`) | register.test: key | ✅ |
| `redact()`: `email` pattern (ASCII + Unicode) | register.test: email ×2 | ✅ |
| `redact()`: `bank_account` (IBAN) pattern | register.test: IT, DE | ✅ |
| `redact()`: `card` pattern | register.test: card | ✅ |
| `redact()`: `phone` pattern (`+`, `()`, spaces, `/`, native digits) | register.test: 5 cases | ✅ |
| `redact()`: 8-digit floor keeps short numbers | register.test: `2024` | ✅ |
| `redact()`: `secret` in assignments and URLs, env lookups left alone | register.test: passwords | ✅ |
| `redact()`: private key blocks, Bearer, Stripe keys | register.test: passwords | ✅ |
| `redact()`: dates and IPv4 not taken as phones | register.test: dates | ✅ |
| `toastText()`: known locale (POSIX + BCP 47 style) | register.test: it, ja, pt-BR | ✅ |
| `toastText()`: unknown / missing locale → English | register.test: xx_XX, undefined | ✅ |
| `prompt.submit`: masks, counts, toasts, hands on | hooks.test: masked prompt | ✅ |
| `prompt.submit`: nothing found → no toast, text unchanged | hooks.test: clean prompt | ✅ |
| `prompt.submit`: `LANG` read through `$.env.get` | hooks.test: masked prompt | ✅ |
| `redact()`: hashes and UUIDs not taken as keys; a named key masked once | register.test: hashes, passwords | ✅ |
| `redactDeep()`: nested strings masked, `base64`/`data` kept | register.test: tool result | ✅ |
| `maskedKinds()`: only new placeholders, by kind | register.test: counts | ✅ |
| `tool.call`: tool output masked before the model reads it | hooks.test: tool prints | ✅ |
| `tool.call` guard: `Write`/`Edit` adding placeholders refused, plain edit passes | hooks.test: placeholder guard | ✅ |
| `tool.call`: fail closed when masking throws | hooks.test: output withheld | ✅ |
| `Write` guard: unreadable target refused | hooks.test: unreadable target | ✅ |
| `ui.render`: placeholder drawn as chip | hooks.test: highlighted row | ✅ |
| `ui.render`: no placeholder → `next(e)` | hooks.test: engine row | ✅ |
| `NATIONAL_IDS`: all 9 country patterns | register.test: national IDs | ✅ |
| `countryIds()`: one code, a list, `all`, unknown code | register.test: chosen countries | ✅ |
| `countries` option read at load and applied | hooks.test: countries option | ✅ |
| `color` option read at load and painted | hooks.test: color option | ✅ |
| `color` option: unknown value falls back to purple | — | ⚠️ not tested |
| Banner: shown on first session, dismissed for good | hooks.test: banner greets | ✅ |
| Banner: `/redact-secrets` shows it again with settings | hooks.test: command | ✅ |
| `prompt.submit` `.catch`: fail closed if the hook throws | — | ⚠️ not tested (no way to make the hook throw from a test) |
| `prompt.submit`: slash command passed through | — | ⚠️ not tested |
| `prompt.submit`: `LC_ALL` / `LC_MESSAGES` precedence over `LANG` | — | ⚠️ not tested |
| `prompt.submit`: placeholders already in the prompt not re-counted | — | ⚠️ not tested |
| `redact()`: other key prefixes (`ghp_`, `AKIA`, `AIza`, `xox`, JWT, generic 32+) | — | ⚠️ not tested |
| `ui.render` on `desktop` / `vscode` / `mobile` surfaces | hooks.test: highlighted row | ✅ |

**Summary:** 23 of 29 tracked paths covered (~79%). Every branch of both hooks and both options is exercised at least once, and the transcript drawing on all four surfaces. The gaps are additional inputs to branches that are already covered (other key formats, other locale variables, an invalid color).

### Countries covered by tests

| Kind | Tested formats |
|------|----------------|
| Phone | 🇮🇹 Italy, 🇺🇸 USA, 🇬🇧 UK, 🇩🇪 Germany, Arabic-Indic digits |
| IBAN | 🇮🇹 Italy, 🇩🇪 Germany |
| Email | ASCII, Unicode (accented local part and domain) |
| National ID | 🇮🇹 🇺🇸 🇬🇧 🇪🇸 🇫🇷 🇧🇷 🇮🇳 🇲🇽 🇨🇳 (one each) |

Contributions adding test cases for more countries are welcome: add a line to `register.test.ts`.

---

## Development

Run Claude Code with the mod loaded straight from this folder:

```
claude --plugin-dir /path/to/redact-secrets
```

Validate the manifest and the module the way the engine will read them:

```
claude plugin validate .
```

Type-check (the engine writes the types into `.claude-plugin/types/` the first time it loads the mod):

```
npx tsc -p .
```

---

## Customizing

Everything lives in `hooks/register.tsx`.

- **Add a country:** add `XX: /regex/g` to `NATIONAL_IDS`, a line to the `countries` description in `plugin.json`, and a test case.
- **Add a universal pattern:** append `['kind', /regex/gu]` to `PATTERNS`. Put more specific patterns before more generic ones.
- **Add a color:** add it to `COLORS` and to the `color` option's `options` list in `plugin.json`.
- **Show more or fewer characters:** change `m.slice(0, 3)` in `redact()`.
- **Add or fix a translation:** add a key to `LABELS` (the lowercase ISO 639-1 code).
- **Change the digit floor:** change the `< 8` in `redact()`.

---

## Limits and known trade-offs

- **Regex based.** False positives (a long ID taken for a key, a long order number taken for a phone) and misses are possible. It is a safety net, not a guarantee.
- **The first 3 characters reach the model.** That is by design, so you can tell values apart. For an email that is the start of a name; for a key it is usually the public prefix (`sk-`, `ghp`).
- **Short local numbers pass.** Phone numbers with fewer than 8 digits are not masked.
- **Only 9 countries have national ID patterns.** Other countries' IDs are masked only if they are long enough to look like a number.
- **ID patterns check the format, not the checksum.** A random string with the right shape is masked too.
- **The model's own replies are not masked**, nor is anything a tool writes: only your prompt and what tools return to the model.
- **Claude cannot see the real values in your files either.** Debugging "why does this key not work?" is harder; paste what is needed into a file Claude does not read, or switch the mod off for that task.
- **The placeholder guard covers `Edit` and `Write` only.** A shell command (`sed -i`, `echo … > .env`) carrying a placeholder is not stopped.
- **Long numbers in tool output may be masked**, such as 13-digit timestamps: they fail the Luhn check, so they are not called cards, but they are still masked as `phone`, since a long bare number may be an international phone.
- **Slash command arguments are not masked.**
- **The original value is not kept anywhere.** It cannot be restored later in the conversation.

---

## FAQ

**Does it send anything anywhere?**
No. It runs entirely inside your local Claude Code process and makes no network calls.

**Can Claude still help me if the data is masked?**
Yes, for most tasks. The placeholder says what kind of value was there, so Claude can still write "send it to ⟦email:mar•••⟧" or explain how to use an API key. If Claude really needs the value, put it in a file or an environment variable instead of the prompt.

**I typed `⟦…⟧` myself. Will it be counted?**
No. Placeholders already present in your text are subtracted from the count.

**Why is my toast in English?**
Your `LC_ALL` / `LC_MESSAGES` / `LANG` is unset or names a language not in the table. Check with `echo $LANG`.

---

## License

[MIT](LICENSE) © 2026 webdiego
