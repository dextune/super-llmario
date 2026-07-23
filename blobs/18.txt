# SUPER QWEN RPG 2

브라우저에서 실행되는 팬메이드 횡스크롤 액션 RPG입니다. 기존 직선형 스테이지 구조를 **마을 거점, 직업별 빌드, 장비 경제, 퀘스트, 지역 목표, 엘리트와 3단계 보스**가 연결된 캠페인으로 확장했습니다.

## 주요 기능

- 선봉대, 비전술사, 척후병 3개 직업
- 직업별 J/K/L 기술과 6노드 스킬 트리
- 상점, 대장간, 스킬 성소, 퀘스트 게시판, 인벤토리
- 장비 희귀도, 옵션, 유일 효과, 강화 +7, 재련, 판매, 분해
- 서로 다른 목표와 환경 규칙을 가진 6개 지역
- 방패, 원거리, 회복, 돌진, 소환 등 역할 기반 적
- 6종 엘리트 속성과 3단계 최종 보스
- 버전 관리되는 localStorage 자동 저장
- 외부 런타임 의존성 없는 Node 테스트

상세 설계와 완료 기준은 [`docs/RPG_EXPANSION_PLAN.md`](docs/RPG_EXPANSION_PLAN.md)를 참고하십시오.

## 실행

브라우저 부트스트랩이 소스 조각을 불러오므로 `file://`이 아니라 정적 웹 서버로 저장소 루트를 제공해야 합니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## 조작

| 키 | 기능 |
|---|---|
| A/D 또는 ←/→ | 이동 |
| Shift | 달리기 |
| Space/W/↑ | 점프 |
| J | 기본 공격 |
| K | 직업 주력기 |
| L | 직업 보조기 |
| Q / E | 체력 / 마나 물약 |
| I | 장비와 가방 |
| P / Escape | 일시정지 |

마우스 좌클릭은 기본 공격, 우클릭은 주력기입니다. 모바일에서는 화면 하단 터치 패드를 사용합니다.

## 테스트

Node.js 18 이상에서 실행합니다. 외부 npm 패키지는 필요하지 않습니다.

```bash
npm test
npm run check
```

테스트 구성:

- `tests/rpg2-core.test.js`: 소스 무결성, 성장, 아이템, 상점, 강화, 퀘스트, 저장 단위 테스트
- `tests/rpg2-smoke.test.js`: 실제 부트스트랩과 DOM/canvas 스텁 기반 전체 6지역 캠페인 테스트
- `scripts/assemble-sources.js`: manifest에 따라 원본을 조립하고 바이트 길이·SHA-256·JavaScript 문법 검증

배포용 단일 파일이 필요할 때 다음 명령으로 `dist/`에 조립할 수 있습니다.

```bash
npm run assemble
```

## 구조

```text
index.html                    RPG 2 화면과 오버레이
css/rpg2.css                  RPG 메타 UI
js/bootstrap.js               브라우저 소스 조립·무결성 검증
js/source-manifest.json       소스 순서·크기·SHA-256
js/core.parts/*.part          순수 RPG 도메인 로직 원본
js/game.parts/*.part          게임 상태·전투·UI·저장 런타임 원본
scripts/assemble-sources.js   Node 조립·검증 도구
tests/                        단위·전체 캠페인 테스트
```

기존 버전의 소스는 비교와 참고를 위해 보존되어 있습니다. 현재 `index.html`은 RPG 2 부트스트랩을 실행합니다.

## 고지

비상업적 교육 목적의 팬메이드 트리뷰트입니다. 원작 캐릭터와 상표의 권리는 각 권리자에게 있습니다.
