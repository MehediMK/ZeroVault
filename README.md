# ZeroVault — Client-side Password Vault (Encrypted JSON)

ZeroVault is a **client-only** password vault web app:
- **No backend**
- **No database**
- **No browser storage** (no localStorage, IndexedDB, cookies)
- Your secrets live only in an **encrypted JSON file** that you download and keep.

This repository hosts **only application code** (safe for GitHub Pages).  
**Vault files must never be committed.**

---

## ✅ How it works

### Create a new vault
1. Open the app
2. Click **Create New Vault**
3. Set a **Master Password**
4. Download the generated encrypted JSON file (example: `my.vault.json`)

### Open existing vault
1. Click **Open Existing Vault**
2. Upload your encrypted JSON file
3. Enter the master password
4. The vault decrypts **in memory only**

### Update vault
1. Add/Edit/Delete entries
2. Click **Save & Download Vault JSON**
3. The app re-encrypts the full dataset and downloads a new JSON file

---

## 🔐 Security model

- Master password is **never stored** and **never written** to the JSON file.
- Key is derived from the master password using **PBKDF2 (SHA-256) + Salt**.
- Vault data is encrypted using **AES-GCM** (authenticated encryption).
- If the password is wrong or the file is modified, decryption fails.

### Data is never:
- sent to any server
- stored in localStorage / IndexedDB / cookies
- logged to console

### Data exists only:
- in memory, during an unlocked session

> Note: JavaScript can’t guarantee perfect memory wiping due to garbage collection, but ZeroVault clears references and overwrites fields where practical.

---

## 🧾 Vault file format (v1)

Vault JSON contains:
- `version`
- `crypto` metadata (kdf, iterations, salt, iv, cipher)
- `encryptedData` (base64)

Example:
```json
{
  "version": 1,
  "crypto": {
    "kdf": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 310000,
    "salt": "base64...",
    "cipher": "AES-GCM",
    "iv": "base64...",
    "tagLength": 128
  },
  "encryptedData": "base64..."
}
