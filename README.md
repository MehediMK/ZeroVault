# ZeroVault 🔐  
### Offline Client-Side Password Manager (Encrypted JSON)

**ZeroVault** is a **secure, offline, client-side password manager** that runs entirely in your browser.  
All credentials are encrypted locally and stored only in a **user-controlled encrypted JSON file**.

> ✅ No servers  
> ✅ No cloud  
> ✅ No tracking  
> ✅ No browser storage  
> ✅ Works fully offline once loaded  

This repository contains **only frontend code** and is safe to host on **GitHub Pages**.

---

## 🚀 Live Demo
👉 https://mehedimk.github.io/ZeroVault/

*(Replace with your real GitHub Pages URL)*

---

## 🧠 What makes ZeroVault different?

Unlike traditional password managers, ZeroVault follows a **zero-trust architecture**:

- GitHub hosts **only UI + logic**
- Your passwords never leave your device
- You keep and manage your encrypted vault file yourself
- No account, no sync, no telemetry

ZeroVault is ideal if you want:
- a **portable password vault**
- a **cloud-free password manager**
- a **transparent, auditable security model**

---

## 🔐 How ZeroVault works

### 1️⃣ Create a new vault
1. Open the app
2. Click **Create New Vault**
3. Set a **master password**
4. Download the generated encrypted JSON file  
   (example: `my.vault.json`)

### 2️⃣ Open an existing vault
1. Click **Open Existing Vault**
2. Upload your encrypted JSON file
3. Enter your master password
4. Vault decrypts **only in memory**

### 3️⃣ Update the vault
1. Add / edit / delete entries
2. Click **Save & Download Vault JSON**
3. A **new encrypted file** is generated

> ⚠️ Important: Changes are saved only when you download the updated vault file.

---

## 🧾 Vault file format (v1)

The vault file contains **no plaintext secrets**.

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
