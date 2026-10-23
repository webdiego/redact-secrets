# redact-secrets

A Claude Code mod that masks sensitive data in your prompts **before they are sent** to the model.

Emails, phone numbers, API keys, credit card numbers and IBANs are replaced with a placeholder that keeps only their first 3 characters, e.g. `⟦email:mar•••⟧`. In the transcript the masked value is shown highlighted, and a toast tells you how many items were masked, in your system language (35 languages, English fallback).

```
you type:   write to mario.rossi@gmail.com, tel +39 333 123 4567
model sees: write to ⟦email:mar•••⟧, tel ⟦phone:+39•••⟧
toast:      🔒 Sensitive data masked before sending: 2
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install redact-secrets --marketplace webdiego/redact-secrets
```

Answer `y` to add the marketplace, then pick a scope (user scope applies it to every session).

From a shell:

```
claude plugin install redact-secrets --marketplace webdiego/redact-secrets
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `webdiego/redact-secrets`, then Add plugin.

## What is detected

- **Email**: including international addresses (`josé@müller.de`)
- **Phone**: 8+ digits, with `+`/`00` prefixes, spaces, `()`, `.`, `-`, `/`; Latin, Arabic and Indic digits
- **API keys**: OpenAI/Anthropic (`sk-`), GitHub (`ghp_`, `github_pat_`), AWS (`AKIA`), Google (`AIza`), Slack (`xox*-`), JWTs, and any 32+ character token mixing letters and digits
- **Credit cards**: 13–19 digits
- **IBAN**: any country

Slash commands are left untouched.

## Limits

- Detection is regex based: false positives and misses are possible. Numbers with fewer than 8 digits are never masked.
- The first 3 characters of each value do reach the model.
- National ID numbers (tax codes, SSNs, ...) are not covered.

## License

MIT
