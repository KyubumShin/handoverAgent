# Handover

세션 컨텍스트(에러, 워크플로우, 패턴)를 자동으로 캡처하고, 자체 정리되는 `CLAUDE.md`와 자동 생성 커맨드 파일을 관리하는 경량 Claude Code 플러그인.

CLI 없음. MCP 서버 없음. API 키 없음. 빌드 없음. 순수 hooks + skills.

## 작동 방식

```
Hooks (캡처)  →  세션 데이터 (파일)  →  에러 레저 (스테이징)  →  CLAUDE.md + Commands (출력)
```

**Hooks**는 Claude Code 세션 중 자동으로 실행되어 프롬프트, 에러, 도구 실패, 지시 위반을 캡처합니다. 에러는 영구 **에러 레저**에 축적되며, 여러 세션에 걸쳐 반복되는 에러만 `.claude/CLAUDE.md`에 **프로모션**됩니다. 이를 통해 일회성 이슈를 필터링하고 지속적인 문제만 표면화합니다.

**Skills**를 통해 레저를 검토 및 관리하고, 프로젝트 컨텍스트를 부트스트랩하며, 상태를 확인할 수 있습니다.

세션 데이터는 임시(`.handover/session/`, gitignored)입니다. 에러 레저(`.handover/error-ledger.jsonl`)는 세션 간에 유지됩니다. 가치 있는 출력은 `.claude/`에 저장되어 프로젝트와 함께 커밋됩니다.

## 설치

```bash
# 플러그인 디렉토리에서
claude plugin add /path/to/handoverAgent

# 또는 개발용
claude --plugin-dir /path/to/handoverAgent
```

## 빠른 시작

```bash
# 1. 초기화 — 프로젝트를 분석하고 CLAUDE.md 컨텍스트 생성
/handover:init

# 2. 평소대로 작업 — hooks가 에러와 패턴을 자동으로 캡처

# 3. 동기화 — 에러 레저 검토 및 관리
/handover:sync

# 4. 상태 확인
/handover:status
```

초기화 후에는 모든 것이 자동입니다.

## 에러 레저

에러 레저(`.handover/error-ledger.jsonl`)는 Handover 에러 추적의 핵심입니다:

```
세션 중:
  on-prompt.mjs ──→ 지시 위반 감지 ──→ errors.jsonl
  on-tool-fail.mjs ──→ 분류 + 포맷 ──→ errors.jsonl
  on-tool-done.mjs ──→ 감지 + 포맷 ──→ errors.jsonl

세션 종료 시:
  errors.jsonl ──→ 핑거프린트 ──→ error-ledger.jsonl에 병합
                                        │
                                        ├─ sessionCount < 임계값 → 레저에 유지 (스테이징)
                                        └─ sessionCount >= 임계값 → CLAUDE.md에 프로모션
```

- **핑거프린팅**: 타입 + 파일 + 정규화된 메시지로 에러 중복 제거 (변동하는 라인 번호 제외)
- **프로모션 임계값**: 에러가 2개 이상 세션에서 나타나야 CLAUDE.md에 반영 (설정 가능)
- **CLAUDE.md는 출력 전용**: 프로모션된 레저 항목에서 전체 재생성, 에러 데이터 읽기 없음
- **지시 위반**: "내가 말했잖아..."와 같은 사용자 교정이 일반 에러처럼 캡처 및 추적

## Skills

### `/handover:init`
프로젝트(package.json, 디렉토리 구조, git 히스토리)를 분석하고 생성:
- `.claude/CLAUDE.md`에 `<!-- HANDOVER:START/END -->` 관리 섹션 (스택, 빌드 명령어, 주요 디렉토리)
- `.claude/commands/*.md` 워크플로우 파일 (build, test, dev) — 감지된 스크립트 기반
- `.handover/` 세션 데이터 디렉토리 구조

### `/handover:sync`
에러 레저 검토 및 관리:
- 모든 레저 항목과 프로모션 상태 확인
- 항목을 CLAUDE.md에 강제 프로모션 (임계값 미만이더라도)
- 항목 디모션 (CLAUDE.md에서 제거)
- 요약 문구 편집
- CLAUDE.md 관리 섹션 재생성

### `/handover:status`
현재 상태 표시: 관리 섹션 크기, 에러 레저 통계(전체/프로모션/스테이징 항목, 상위 에러 타입), 세션 통계, 아카이브 수, 생성된 커맨드, 설정.

## Hooks (자동)

| 이벤트 | 캡처 내용 |
|--------|----------|
| `UserPromptSubmit` | 프롬프트와 추출된 토픽 + 지시 위반 감지 |
| `PostToolUseFailure` | 모든 도구 실패 (에러 분류 포함) |
| `PostToolUse` (Bash) | 성공한 Bash 호출의 빌드/테스트 에러 |
| `SessionStart` | 이전 세션 컨텍스트 주입, 동기화 제안 |
| `Stop` | 세션 마무리, 레저 파이프라인 실행, 데이터 아카이브 |
| `PreCompact` | 대화 압축 전 세션 요약 저장 |

`SessionStart`(컨텍스트 주입)을 제외한 모든 hooks는 무음(stdout 없음).

## CLAUDE.md 관리

Handover는 마커 사이의 섹션만 관리합니다 — 기존 내용은 절대 건드리지 않습니다:

```markdown
# 기존 CLAUDE.md 내용...

<!-- HANDOVER:START -->
## Session Context
### Errors (auto-tracked)
- [02/19] type_error: src/api/users.ts:45 — Cannot read properties of null
- [02/18] build_error: npm — missing @types/node
<!-- HANDOVER:END -->
```

여러 세션에 걸쳐 지속되는 에러만 여기에 표시됩니다. 관리 섹션은 매 세션 종료 시 에러 레저에서 재생성됩니다 — 1,000자 제한, 최신 항목 우선.

## 설정

`.handover/config.json`을 생성하여 커스터마이즈:

```json
{
  "maxChars": 1000,
  "pruneAgeDays": 7,
  "maxArchivedSessions": 10,
  "promotionThreshold": 2,
  "maxLedgerEntries": 50,
  "ledgerPruneAgeDays": 30
}
```

| 키 | 기본값 | 설명 |
|----|--------|------|
| `maxChars` | `1000` | CLAUDE.md 관리 섹션 최대 문자 수 |
| `pruneAgeDays` | `7` | 레거시 기간 기반 정리 |
| `maxArchivedSessions` | `10` | 보관할 최대 아카이브 세션 수 |
| `promotionThreshold` | `2` | CLAUDE.md 프로모션 전 필요한 세션 수 |
| `maxLedgerEntries` | `50` | 에러 레저 최대 항목 수 |
| `ledgerPruneAgeDays` | `30` | N일 후 미확인 레저 항목 제거 |

## 프로젝트 구조

```
handoverAgent/
  .claude-plugin/plugin.json      # 플러그인 매니페스트
  hooks/
    hooks.json                    # Hook 등록
    lib/
      session-store.mjs           # 세션 데이터 저장 + 레저 I/O
      claude-md.mjs               # CLAUDE.md 마커 파싱/쓰기
      error-detector.mjs          # 에러 분류 + 지시 위반 감지
      error-ledger.mjs            # 핑거프린팅, 레저 병합, 프로모션, CLAUDE.md 생성
    on-prompt.mjs                 # 프롬프트 + 토픽 + 지시 위반 기록
    on-tool-fail.mjs              # 도구 실패 기록
    on-tool-done.mjs              # 빌드/테스트 에러 감지
    on-session-start.mjs          # 컨텍스트 주입 + 동기화 제안
    on-session-end.mjs            # 마무리 + 레저 파이프라인 + 아카이브
    on-compact.mjs                # 압축 전 요약 저장
  skills/
    init/SKILL.md                 # 프로젝트 분석 + 부트스트랩
    sync/SKILL.md                 # 에러 레저 검토 + 관리
    status/SKILL.md               # 상태 표시 + 레저 통계
```

## 라이선스

MIT
