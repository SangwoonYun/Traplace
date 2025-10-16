# 🎯 Traplace

> 킹샷(Kingshot) 게임의 자리 배치를 시뮬레이션하는 공간 기반 시각화 도구

[![라이선스](https://img.shields.io/github/license/SangwoonYun/Traplace.svg)](LICENSE)
[![Python Version](https://img.shields.io/badge/python-3.13+-blue.svg)]()
[![최신 릴리스](https://img.shields.io/github/v/release/SangwoonYun/Traplace?include_prereleases&sort=semver)](https://github.com/SangwoonYun/Traplace/releases)
[![기여자](https://img.shields.io/github/contributors/SangwoonYun/Traplace.svg)]()
[![Docs](https://img.shields.io/badge/문서-available-brightgreen.svg)]()

> 🌐 **English version:** [README.md](README.md)

---

## 🧭 개요

**Traplace**는 _킹샷(Kingshot)_ 게임의 자리 배치를 시뮬레이션하고 시각적으로 구성할 수 있는 웹 기반 툴입니다.  
마름모(다이아몬드) 형태의 격자 좌표를 기반으로,  
**도시, 본부, 연맹 깃발, 함정 등**의 배치를 실시간으로 구성하고 비교할 수 있습니다.

---

## ✨ 주요 기능

- 🧱 **-135° 회전된 마름모형 좌표 시스템**
- 🧭 **확대/축소 및 이동 (Zoom & Pan)**
- 🧩 **1×1, 2×2, 3×3 블록 배치 기능**
- 🏙️ **도시센터, 평원본부, 연합 깃발 시뮬레이션**
- 🌍 **브라우저 언어 기반 자동 i18n 지원**
- 💾 **온라인 i18n 파일 동적 로드 및 영어 기본값**

![traplace_ko.png](https://github.com/user-attachments/assets/9ff43c40-b800-4bcd-a093-761e0b532be1)

---

## 🏗️ 아키텍처 개요

```
프론트엔드 (HTML/CSS/JS)
   └── 보드 렌더러 (마름모 그리드)
         ├── 좌표 변환기
         ├── 블록 관리자
         ├── 줌/팬 컨트롤러
         └── i18n 로더
백엔드 (Python)
   └── Jinja 템플릿 렌더러
         ├── 인덱스
         ├── 단축 URL API
         └── 헬스 체크
```

---

## ⚙️ 설치 및 실행

### 사전 요구사항

- Python 3.13+
- Git

### 설치

```bash
git clone https://github.com/SangwoonYun/Traplace.git
cd Traplace
pip install -r requirements.txt
```

### 로컬 실행

```bash
python manage.py
```

브라우저에서  
👉 http://localhost:5500 접속

---

## 🌐 배포 주소

Traplace는 다음 주소에서 서비스되고 있습니다:  
🔗 [https://traplace.swyun.kr](https://traplace.swyun.kr)

> ⚠️ 이 주소는 향후 변경될 수 있습니다.

---

## 🌐 다국어(i18n)

Traplace는 다국어 UI를 지원합니다.

| 언어   | 파일           | 상태 |
| ------ | -------------- | ---- |
| 영어   | `i18n/en.json` | ✅   |
| 한국어 | `i18n/ko.json` | ✅   |

새로운 언어 파일을 `/i18n/` 폴더에 추가하면 런타임 시 자동으로 감지됩니다.

---

## 📦 프로젝트 구조

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

## 🧾 라이선스

이 프로젝트는 **MIT License**를 따릅니다.  
자세한 내용은 [LICENSE](LICENSE)를 참고하세요.

---

## 👤 작성자

**#135 [KOR] 방구석개발자**  
📧 dev.swyun@gmail.com  
🐙 [@SangwoonYun](https://github.com/SangwoonYun)

---

> _“공간을 이해하는 자가 전장을 지배한다.”_
