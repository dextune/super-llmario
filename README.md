# METAL STRIKE — RPG OVERDRIVE

브라우저에서 실행되는 팬메이드 횡스크롤 런앤건 RPG입니다. 기존 Metal Strike 캠페인에 메탈슬러그식 즉각적인 타격감과 장기 성장 요소를 결합했습니다.

## 이번 고도화 핵심

### 그래픽

- 다층 전장 실루엣, 폐허, 탐조등, 잔해를 추가한 전장 배경
- 엘리트 적 전용 오라와 속성 표식
- 치명타 방사형 임팩트, 근접 베기 궤적, 충격파, 화면 비네팅
- 오버드라이브 속도선, 저체력 위험 연출, 카메라 킥
- 아케이드 캐비닛과 CRT 화면 스타일 개선

### 콘텐츠와 RPG

- 전투 XP와 영구 레벨 성장
- 레벨에 따른 화력, 최대 체력, 치명타, 연사, 근접 공격 성장
- BERSERK, ARMORED, RAPID, VAMP 엘리트 변이
- 콤보와 D/C/B/A/S 스타일 랭크, 점수 배율
- 체력이 낮은 일반 적을 근접 공격으로 처형
- 전투 게이지 100%에서 7초간 오버드라이브 발동

### 타격감과 사운드

- 일반 피격, 치명타, 약점, 처치, 엘리트 처치별 히트스톱
- 무기 반동 기반 화면 흔들림과 순간 카메라 킥
- 피격 숫자, CRIT 표기, 확대 임팩트 링
- WebAudio 압축기 기반 총기, 폭발, 칼날, 랭크 상승, 레벨업 사운드 레이어

## 조작

| 키 | 기능 |
|---|---|
| A/D 또는 ←/→ | 이동 |
| Shift | 달리기 |
| Space/W/↑ | 점프 또는 위 조준 |
| S/↓ | 앉기 |
| J | 사격 |
| K | 수류탄 |
| L | 근접 공격 및 처형 |
| E | 오버드라이브 발동 |
| P/Escape | 일시정지 |

## 실행

브라우저 부트스트랩이 소스 조각을 불러오므로 정적 웹 서버가 필요합니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 여십시오.

## 테스트

Node.js 18 이상에서 외부 npm 패키지 없이 실행됩니다.

```bash
npm run check
```

테스트는 원본 소스 무결성, RPG 도메인, 전체 캠페인 스모크 테스트와 Overdrive 소스 변환·문법·멱등성을 검증합니다.

## 구조

```text
index.html                    게임 화면과 조작 안내
css/style.css                 기본 아케이드 UI
css/rpg2.css                  기존 RPG UI 호환 스타일
css/overdrive.css             Overdrive 그래픽 고도화
js/audio.js                   기본 WebAudio 시스템
js/sprites.js                 픽셀 스프라이트 렌더러
js/overdrive-audio.js         총기·폭발·근접 전용 사운드 레이어
js/overdrive-runtime.js       RPG·타격감·그래픽 런타임
js/overdrive.js               검증형 런타임 패치 적용기
js/bootstrap.js               소스 무결성 검증 및 런타임 패치 적용
js/core.parts/*.part          순수 게임 도메인
js/game.parts/*.part          기본 런앤건 런타임
scripts/assemble-sources.js   소스 조립 및 검증
tests/                        단위·스모크·Overdrive 테스트
```

## 고지

비상업적 교육 목적의 팬메이드 트리뷰트입니다. 원작 캐릭터와 상표의 권리는 각 권리자에게 있습니다.
