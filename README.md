# 🎯 Traplace

> A spatial simulation tool for **Kingshot** game, enabling strategic placement and visualization of city blocks.

[![License](https://img.shields.io/github/license/SangwoonYun/Traplace.svg)](LICENSE)
[![Python Version](https://img.shields.io/badge/python-3.13+-blue.svg)]()
[![Latest Release](https://img.shields.io/github/v/release/SangwoonYun/Traplace?include_prereleases&sort=semver)](https://github.com/SangwoonYun/Traplace/releases)
[![Contributors](https://img.shields.io/github/contributors/SangwoonYun/Traplace.svg)]()
[![Docs](https://img.shields.io/badge/docs-available-brightgreen.svg)]()

> 🇰🇷 **한국어 버전:** [README.ko.md](README.ko.md)

---

## 🧭 Overview

**Traplace** is an interactive map-based simulation tool that replicates the placement logic of the _Kingshot_ game.  
It allows users to test, visualize, and optimize **territory layouts, alliance structures, and flag positions** using a dynamic diamond-grid system.

### ✨ Key Features

- 🧱 **Diamond-grid coordinate system** (rotated -135°)
- 🧭 **Zoom and pan** for large-scale maps
- 🧩 **Interactive block placement** (1×1, 2×2, 3×3 tiles)
- 🏙️ **City center, HQ, and alliance flag simulation**
- 🌍 **Language auto-selection (i18n)** based on browser locale (EN/KR)
- 💾 **Dynamic i18n file loading** with fallback to English

![traplace_en.png](https://github.com/user-attachments/assets/ae8dc648-e31b-44a9-89b4-36fe7f5a0a47)

---

## 🏗️ Architecture Overview

```
Frontend (HTML/CSS/JS)
   └── Dynamic Board Renderer (Diamond Grid)
         ├── Coordinate System
         ├── Block Manager
         ├── Zoom/Pan Controller
         └── i18n Loader
Backend (Python)
   └── Jinja Template Renderer
         ├── Index
         ├── URL Shortener API
         └── Health Check
```

---

## ⚙️ Installation

### Prerequisites

- Python 3.13+
- Git

### Setup

```bash
git clone https://github.com/SangwoonYun/Traplace.git
cd Traplace
pip install -r requirements.txt
```

### Run the Local Server

```bash
python manage.py
```

Then open:  
👉 http://localhost:5500

---

## 🌐 Internationalization (i18n)

Traplace supports multilingual UI.

| Language         | File              | Status |
| ---------------- | ----------------- | ------ |
| English          | `i18n/en.json`    | ✅     |
| 한국어           | `i18n/ko.json`    | ✅     |
| 简体中文         | `i18n/zh-CN.json` | ✅     |
| 繁體中文         | `i18n/zh-TW.json` | ✅     |
| 日本語           | `i18n/ja.json`    | ✅     |
| Français         | `i18n/fr.json`    | ✅     |
| Deutsch          | `i18n/de.json`    | ✅     |
| Español          | `i18n/es.json`    | ✅     |
| Italiano         | `i18n/it.json`    | ✅     |
| Polski           | `i18n/pl.json`    | ✅     |
| Português        | `i18n/pt.json`    | ✅     |
| العربية          | `i18n/ar.json`    | ❌     |
| Türkçe           | `i18n/tr.json`    | ✅     |
| ไทย              | `i18n/th.json`    | ✅     |
| Bahasa Indonesia | `i18n/id.json`    | ✅     |

You can add more language files under `/i18n/` and Traplace will load them dynamically at runtime.

---

## 📦 Project Structure

```
Traplace/
 ├─ app/
 │   ├─ app/
 │   │   ├─ route/
 │   │   │   ├─ core.py
 │   │   │   └─ shortener.py
 │   │   ├─ utils/
 │   │   │   └─ shortener.py
 │   │   ├─ __init__.py
 │   │   ├─ config.py
 │   │   └─ extensions.html
 │   ├─ static/
 │   │   ├─ js/
 │   │   │   └─ interactions/
 │   │   ├─ css/
 │   │   └─ images/
 │   ├─ templates/
 │   │   └─ index.html
 │   ├─ i18n/
 │   │   ├─ en.json
 │   │   └─ ko.json
 ├─ manage.py
 ├─ wsgi.py
 ├─ Dockerfile
 ├─ compose.yaml
 ├─ requirements.txt
 ├─ README.md
 └─ README.ko.md
```

---

## 🌐 Deployment

Traplace is currently hosted at:  
🔗 [https://traplace.swyun.kr](https://traplace.swyun.kr)

> ⚠️ The deployment address may change in the future.

---

## 🧾 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE).

---

## 👤 Author

**#159 [TCB] 방구석개발자**  
📧 dev.swyun@gmail.com  
🐙 [@SangwoonYun](https://github.com/SangwoonYun)

---

> _“Visualize the battlefield. Master the space.”_
