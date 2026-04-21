# ZeroVault

Offline-first password vault with local encryption and user-controlled encrypted JSON storage.

## Product Feature List

ZeroVault is a browser-based password manager designed for users who want a portable vault without relying on a cloud account or backend service.

### Core Vault
- Create, open, lock, and download encrypted JSON vault files
- Client-side encryption and decryption only
- No backend, no sync server, no browser storage requirement
- Portable vault workflow suitable for static hosting and GitHub Pages

### Password Management
- Add, edit, archive, restore, favorite, delete, and search entries
- Password generator with configurable strength options
- Password health audit for weak, reused, missing, and expiring passwords
- Password history and per-entry rotation tracking
- TOTP / 2FA secret storage and offline code generation

### Entry Model
- Categories for logins, cards, secure notes, identities, bank entries, and licenses
- Category-specific detail fields and validation rules
- Sensitive-entry mode with per-field reveal and timed auto-hide
- Recovery code storage and attachment reference tracking

### Safety and Recovery
- Undo history for full action rollback
- Entry version history and password history
- Named snapshots and restore points
- Download history tracking inside the vault
- Backup-friendly save flow with timestamped copy support
- Printable recovery sheet export

### Import, Audit, and Export
- Import preview before merge
- Duplicate/conflict scoring with merge, replace, duplicate, skip, and review actions
- Audit report export
- Vault summary export
- Built-in audit panel for real-time password health visibility

### Usability
- Search, filters, sorting, favorites, archived view, pagination, and bulk actions
- Mobile-friendly layout
- PWA basics with offline caching and install/update support
- Accessibility improvements for keyboard flow, labels, and focus visibility

### Documentation
- Getting Started guide
- Security guide
- Backup & Recovery guide
- Import guide
- FAQ

## Why It Matters

- Users keep full control of their encrypted vault file
- Sensitive data stays local to the browser session
- The product includes real-world backup and recovery workflows
- The app is usable offline and deployable as a static site

## Real-World Usage Model

1. Create a vault and choose a strong master password.
2. Add entries, TOTP data, tags, and recovery references.
3. Review validation and audit warnings.
4. Create snapshots before risky edits or imports.
5. Download the updated encrypted vault file after changes.
6. Keep timestamped backups until the new file is verified.

## Run Locally

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Documentation Pages

- Home: `index.html`
- App: `app.html`
- Getting Started: `getting-started.html`
- Security: `security.html`
- Backup & Recovery: `backup-recovery.html`
- Import Guide: `import-guide.html`
- FAQ: `faq.html`
- Marketing Copy: `marketing-copy.html`
- Presentation Summary: `presentation-summary.html`
- Offline Password Manager Guide: `offline-password-manager.html`
- Client-Side Password Manager Guide: `client-side-password-manager.html`
- Changelog: `changelog.html`
- Troubleshooting: `troubleshooting.html`
