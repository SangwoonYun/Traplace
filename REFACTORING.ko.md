# Traplace 리팩토링 & 성능 최적화 계획

> 최종 업데이트: 2026-04-22  
> 브랜치: `fix/turret` → 대상 `main`

---

## 프로젝트 현황

- **백엔드:** Python 3.13 + Flask + Redis (SQL DB 없음)
- **프론트엔드:** Vanilla ES Modules, CSS Layers, 번들러 없음
- **가장 큰 문제:** 테스트 코드 전무 — 테스트 없이는 리팩토링 결과를 검증할 수 없음

---

## 진행 현황 트래커

| 단계 | 항목                                              | 우선순위 | 상태    |
| ---- | ------------------------------------------------- | -------- | ------- |
| 1    | [B1] Undo/Redo 시 커스텀 블록 속성 소실           | 긴급     | ✅ 완료 |
| 1    | [B2] `last_updated` 가 항상 오늘 날짜             | 높음     | ✅ 완료 |
| 1    | [B3] Dead import: `colorPicker.js`                | 높음     | ✅ 완료 |
| 2    | [S1] Rate limit 없음 + URL 길이 검증 없음         | 높음     | ✅ 완료 |
| 2    | [S2] `core.py`에서 `lang` 파라미터 미검증         | 중간     | ✅ 완료 |
| 2    | [S3] Redis에서 꺼낸 경로 재검증 없이 redirect     | 중간     | ✅ 완료 |
| —    | **Phase 3 전에 테스트 작성**                      | 긴급     | ⬜ 예정 |
| 3    | [P1] 60fps 핸들러 내 O(n) 선형 탐색               | 높음     | ⬜ 예정 |
| 3    | [P2] 드래그 중 `recomputePaint()` 과도 호출       | 높음     | ⬜ 예정 |
| 3    | [P3] `renderCells()` DOM 전체 재생성              | 중간     | ⬜ 예정 |
| 3    | [P4] `recomputeRedZone()` 핫 패스의 `console.log` | 중간     | ⬜ 예정 |
| 3    | [P5] i18n JSON `cache: 'no-cache'` 로 매번 요청   | 중간     | ⬜ 예정 |
| 3    | [P6] PNG 내보내기 캔버스 크기 무제한              | 낮음     | ⬜ 예정 |
| 4    | [Q1] `privacy()` / `terms()` 핸들러 중복          | 높음     | ⬜ 예정 |
| 4    | [Q2] `window.__*` 글로벌이 모듈 시스템 우회       | 중간     | ⬜ 예정 |
| 4    | [Q3] 12단 삼항 연산자 3곳에 복붙                  | 중간     | ⬜ 예정 |
| 4    | [Q4] `safeSetPointerCapture` 중복                 | 낮음     | ⬜ 예정 |
| 4    | [Q5] 디버그 글로벌이 프로덕션에 노출              | 중간     | ⬜ 예정 |
| 4    | [Q6] `main.js`에 21개 하드코딩 좌표               | 낮음     | ⬜ 예정 |
| 5    | [A1] Flask 404/500 에러 핸들러 없음               | 낮음     | ⬜ 예정 |
| 5    | [A2] `gunicorn.conf.py` workers 설정 충돌         | 낮음     | ⬜ 예정 |
| 5    | [A3] `SUPPORTED_LANGS` Python + JS 이중 정의      | 낮음     | ⬜ 예정 |
| 5    | [A4] 라우트 핸들러에서 직접 파일 I/O              | 낮음     | ⬜ 예정 |

**상태 표시:** ⬜ 예정 · 🔄 진행 중 · ✅ 완료 · ⏭ 건너뜀

---

## Phase 1 — 버그 수정 (최우선)

리팩토링 전에 반드시 고쳐야 할 실제 버그들.

### [B1] Undo/Redo 시 커스텀 블록 속성 소실

**파일:** [`app/static/js/history.js:57-70`](app/static/js/history.js#L57)  
**문제:** `applySerialized()`가 undo/redo 시 `createBlock(it.kind, it.size, left, top)`만 호출하고 `width`, `height`, `fontSize`, `wordWrap`을 전달하지 않음. 커스텀 블록 크기와 폰트 설정이 undo 후 초기화됨.  
**수정:** `createBlock` 호출 시 모든 속성을 전달하고, 생성 후 나머지 속성도 복원.

### [B2] `last_updated` 가 항상 오늘 날짜

**파일:** [`app/routes/policies.py:103`](app/routes/policies.py#L103), [`:131`](app/routes/policies.py#L131)  
**문제:** `datetime.now().strftime(date_format)` — 법적 문서의 "최종 수정일"이 내용 변경 여부와 무관하게 매일 바뀜.  
**수정:** JSON 파일에 실제 수정일 저장 (예: `"last_updated": "2025-01-01"`), 해당 값을 읽어 표시.

### [B3] Dead Import: `colorPicker.js`

**파일:** [`app/static/js/main.js:42`](app/static/js/main.js#L42)  
**문제:** `setupColorPicker`가 import되고 호출되지만 HTML에 `#colorPicker` 요소가 없어 silently no-op. `ui.css:398–506`의 관련 CSS도 사문화.  
**수정:** import 구문, 호출 코드, 관련 CSS 모두 제거.

---

## Phase 2 — 보안

### [S1] Rate Limit 없음 + URL 길이 검증 없음 (`POST /api/shorten`)

**파일:** [`app/routes/shortener.py:19-63`](app/routes/shortener.py#L19)  
**문제:** 엔드포인트에 IP당 요청 제한이 없어 Redis 저장소 고갈 가능. URL 최대 길이 검사도 없어 수백 MB 문자열이 저장될 수 있음.  
**수정:**

```python
# URL 파싱 직후 추가
if len(raw) > 8190:
    return jsonify(error='url too long'), 400
```

`flask-limiter` 도입 또는 Nginx/프록시 레벨에서 rate limiting 설정.

### [S2] `core.py`에서 `lang` 파라미터 미검증

**파일:** [`app/routes/core.py:18`](app/routes/core.py#L18)  
**문제:** `current_lang = request.args.get('lang', 'en')`이 `SUPPORTED_LANGS` 대조 없이 템플릿에 전달됨. `policies.py`는 이미 검증하는데 `core.py`는 누락.  
**수정:** 템플릿에 전달 전 `if lang not in SUPPORTED_LANGS: lang = 'en'` 추가.

### [S3] Redis 경로 재검증 없이 Redirect

**파일:** [`app/routes/shortener.py:75-81`](app/routes/shortener.py#L75)  
**문제:** Redis에서 꺼낸 `path`를 바로 `redirect()`에 전달. 방어 레이어 추가 필요.  
**수정:** `redirect()` 호출 전, 경로가 `/`로 시작하고 scheme이 없는 상대 경로인지 재검증.

---

## Phase 3 — 성능 최적화

> ⚠️ 이 단계 전에 테스트를 먼저 작성할 것.

### [P1] 60fps 포인터 핸들러 내 O(n) 선형 탐색

**파일:** [`app/static/js/interactions/drag.js`](app/static/js/interactions/drag.js), [`app/static/js/blocks.js`](app/static/js/blocks.js)  
**문제:** `state.blocks.find(b => b.el === el)` 패턴이 코드 전체에 **24회** 등장. 대부분이 60fps로 실행되는 `pointermove` 핸들러 내부. 매 프레임마다 전체 배열 순회.  
**수정:** `state.js`에 `WeakMap<HTMLElement, Block>` 사이드 인덱스 추가:

```javascript
// state.js
export const blockByEl = new WeakMap();

// createBlock 시 등록
blockByEl.set(block.el, block);

// 모든 .find(b => b.el === el) 를 다음으로 교체
blockByEl.get(el);
```

### [P2] 드래그 중 `recomputePaint()` 연쇄 과도 호출

**파일:** [`app/static/js/blocks.js`](app/static/js/blocks.js), [`app/static/js/render.js`](app/static/js/render.js)  
**문제:** `updateBlockPosition()` 호출 시마다 `recomputePaint()` + `validateAllObjects()` + `queueSaveToURL()` + `saveCheckpoint()` 4개가 연쇄 실행. 드래그 중 그리드 스냅마다 발생.  
**수정:**

```javascript
// drag.js — pointerdown 시 플래그 설정, pointerup 시 해제
state.isDragging = true;

// blocks.js — 드래그 중 연쇄 호출 스킵
if (!state.isDragging) {
  recomputePaint();
  saveCheckpoint();
}

// drag.js — pointerup 시 한 번만 실행
recomputePaint();
validateAllObjects();
saveCheckpoint();
```

### [P3] `renderCells()` DOM 전체 재생성

**파일:** [`app/static/js/render.js:123-153`](app/static/js/render.js#L123)  
**문제:** `layer.innerHTML = ''` 후 모든 페인트 타일 `<div>`를 재생성. 블록 이동 시마다 수백 개 DOM 노드 destroy/create 반복.  
**옵션 A (빠른 수정):** 이전/신규 셀 Set을 diff하여 변경된 타일만 추가/삭제.  
**옵션 B (근본 해결):** paint 렌더링을 `<canvas>` 레이어로 교체 (DOM 완전 탈피).

### [P4] `recomputeRedZone()` 핫 패스의 `console.log` 제거

**파일:** [`app/static/js/render.js:274-277`](app/static/js/render.js#L274)  
**문제:** `.filter()` + 문자열 보간을 포함한 `console.log`가 블록 위치 변경 시마다 실행.  
**수정:** 로그 완전 제거 또는 `DEBUG` 플래그로 조건부 처리.

### [P5] i18n JSON `cache: 'no-cache'` 로 매번 네트워크 요청

**파일:** [`app/static/js/i18n.js:175`](app/static/js/i18n.js#L175)  
**문제:** 언어 전환 시마다 서버에 새 요청 발생. HTTP 캐싱 혜택 없음.  
**수정:** `cache: 'no-cache'` → `cache: 'default'` 변경, 정적 파일 서버에 `Cache-Control` 헤더 설정.

### [P6] PNG 내보내기 캔버스 크기 무제한

**파일:** [`app/static/js/exportPNG.js:590-612`](app/static/js/exportPNG.js#L590)  
**문제:** Retina 디스플레이(DPR=2)에서 큰 레이아웃 내보내기 시 10,000×10,000px+ 캔버스 생성 가능. `getImageData` 호출 시 메모리 급증.  
**수정:** 최대 캔버스 크기 제한 (예: 긴 변 기준 4096px), 초과 시 축소 처리.

---

## Phase 4 — 코드 품질

### [Q1] `privacy()` / `terms()` 핸들러 중복

**파일:** [`app/routes/policies.py:88-141`](app/routes/policies.py#L88)  
**문제:** 두 핸들러가 25줄짜리 동일 구조. `page_type` 문자열만 다름.  
**수정:**

```python
def _render_legal(page_type: str):
    lang = request.args.get('lang', 'en')
    # ... 공통 로직 ...
    return render_template('legal.html', ...)

@bp.get('/privacy')
def privacy(): return _render_legal('privacy')

@bp.get('/terms')
def terms(): return _render_legal('terms')
```

### [Q2] `window.__*` 글로벌이 모듈 시스템 우회

**파일:** [`app/static/js/main.js:198`](app/static/js/main.js#L198), [`app/static/js/i18n.js:505`](app/static/js/i18n.js#L505)  
**문제:** `window.__turrets`, `window.__fortresses`, `window.__sanctuaries`가 `main.js`에서 설정되고 `i18n.js`에서 읽힘. 보이지 않는 모듈 간 결합.  
**수정:** `app/static/js/worldBlocks.js` 모듈을 만들어 export, 필요한 곳에서 import.

### [Q3] 12단 삼항 연산자 3곳 복붙

**파일:** [`app/static/js/blocks.js:285-301`](app/static/js/blocks.js#L285), [`app/static/js/exportPNG.js:742`](app/static/js/exportPNG.js#L742), [`app/static/js/exportPNG.js:813`](app/static/js/exportPNG.js#L813)  
**문제:** 블록 종류 → 레이블 매핑 삼항 연산자가 3곳에 그대로 복붙.  
**수정:** `labelForKind(kind, userText, size)` 유틸 함수로 추출 후 3곳 교체.

### [Q4] `safeSetPointerCapture` 중복

**파일:** [`app/static/js/interactions/drag.js:133-142`](app/static/js/interactions/drag.js#L133), [`app/static/js/interactions/pan.js:23-31`](app/static/js/interactions/pan.js#L23)  
**수정:** `app/static/js/interactions/utils.js`로 이동 후 두 파일에서 import.

### [Q5] 디버그 글로벌이 프로덕션에 노출

**파일:** [`app/static/js/main.js:538`](app/static/js/main.js#L538)  
**문제:** `Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint })`가 프로덕션에서 무조건 실행되어 내부 상태가 브라우저 콘솔에 노출.  
**수정:**

```javascript
if (import.meta.env?.DEV) {
  Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });
}
```

또는 전체 제거.

### [Q6] `main.js`의 21개 하드코딩 매직 넘버 좌표

**파일:** [`app/static/js/main.js:146-380`](app/static/js/main.js#L146)  
**문제:** 성, 포탑, 요새, 성소가 `594 * c`, `800 * c` 같은 인라인 매직 넘버로 생성. 좌표 기하를 모르면 맵 수정 불가.  
**수정:** `WORLD_LAYOUT` 상수 배열로 추출:

```javascript
const WORLD_LAYOUT = [
  { kind: 'castle', size: 12, cx: 594, cy: 594 },
  { kind: 'turret', size: 2, cx: 594, cy: 594, name: 'Turret I' },
  // ...
];
```

---

## Phase 5 — 아키텍처

### [A1] Flask 404/500 에러 핸들러 없음

**문제:** Flask가 에러 시 bare Werkzeug HTML 반환. 브랜드 페이지 또는 JSON 응답 필요.  
**수정:** `app/__init__.py`에 `@app.errorhandler(404)`와 `@app.errorhandler(500)` 등록.

### [A2] `gunicorn.conf.py` workers 설정 충돌

**파일:** [`gunicorn.conf.py`](gunicorn.conf.py)  
**문제:** `workers = 4`가 Docker CMD의 `-w ${WORKERS}` (기본: `2`, compose: `1`)에 항상 덮어씌워짐. conf 파일 값이 실제로는 한 번도 사용되지 않음.  
**수정:** `gunicorn.conf.py`에서 `workers` 제거. `WORKERS` 환경변수로만 관리.

### [A3] `SUPPORTED_LANGS` Python + JS 이중 정의

**파일:** [`app/routes/policies.py:19-35`](app/routes/policies.py#L19), [`app/static/js/i18n.js:16-32`](app/static/js/i18n.js#L16)  
**문제:** 이미 불일치 발생 (`ar`이 Python에는 있고 JS에서는 주석 처리됨).  
**수정:** 백엔드 엔드포인트에서 목록을 제공하거나 `supported_langs.json` 단일 소스로 관리.

### [A4] 라우트 핸들러에서 직접 파일 I/O

**파일:** [`app/routes/policies.py:57-85`](app/routes/policies.py#L57)  
**문제:** `load_legal_content()`가 라우트 레이어에서 직접 파일을 읽음.  
**수정:** `app/services/legal.py` 또는 `app/utils/legal.py`로 분리.

---

## 권장 작업 순서

```
Phase 1 (버그) → Phase 2 (보안) → 테스트 작성
                                       ↓
               Phase 3 (성능) → Phase 4 (품질) → Phase 5 (아키텍처)
```

Phase 3 전에 테스트 작성을 강력히 권장합니다. 테스트 없이 성능 최적화를 진행하면 기존 동작이 깨져도 검증할 방법이 없습니다.

**권장 테스트 범위:**

- `pytest`: 모든 백엔드 라우트 (`/`, `/healthz`, `POST /api/shorten`, `GET /s/<code>`, `/privacy`, `/terms`)
- `vitest`: 프론트엔드 핵심 유틸 (`urlState.js`, `history.js`, `blocks.js` 핵심 함수)
