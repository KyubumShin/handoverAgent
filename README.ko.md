# Handover

세션 컨텍스트(에러, 워크플로우, 패턴)를 자동으로 캡처하고, 자체 정리되는 `CLAUDE.md`와 자동 생성 커맨드 파일을 관리하는 경량 Claude Code 플러그인.

CLI 없음. MCP 서버 없음. API 키 없음. 빌드 없음. 순수 hooks + skills.

## 작동 방식

```
Hooks (캡처)  →  세션 데이터 (파일)  →  Skills (종합)  →  CLAUDE.md + Commands (출력)
```

**Hooks**는 Claude Code 세션 중 자동으로 실행되어 프롬프트, 에러, 도구 실패를 캡처합니다. **Skills**는 캡처된 데이터를 `.claude/CLAUDE.md`와 `.claude/commands/`에 실행 가능한 프로젝트 컨텍스트로 종합합니다.

세션 데이터는 임시(`.handover/`, gitignored)입니다. 가치 있는 출력은 `.claude/`에 저장되어 프로젝트와 함께 커밋됩니다.

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

# 3. 동기화 — 캡처된 데이터를 CLAUDE.md에 반영 (세션 시작 시 자동 제안)
/handover:sync

# 4. 상태 확인
/handover:status
```

초기화 후에는 모든 것이 자동입니다.

## Skills

### `/handover:init`
프로젝트(package.json, 디렉토리 구조, git 히스토리)를 분석하고 생성:
- `.claude/CLAUDE.md`에 `<!-- HANDOVER:START/END -->` 관리 섹션 (스택, 빌드 명령어, 주요 디렉토리)
- `.claude/commands/*.md` 워크플로우 파일 (build, test, dev) — 감지된 스크립트 기반
- `.handover/` 세션 데이터 디렉토리 구조

### `/handover:sync`
캡처된 세션 데이터를 처리하여 CLAUDE.md 관리 섹션 업데이트:
- 반복되는 에러를 타입과 파일별로 그룹화
- 자주 나오는 주제와 워크플로우 패턴 식별
- 항목 중복 제거, 크기 제한 준수
- 감지된 워크플로우에 대한 새 커맨드 파일 생성

### `/handover:status`
현재 상태 표시: 관리 섹션 크기, 세션 통계, 아카이브 수, 생성된 커맨드, 설정.

## Hooks (자동)

| 이벤트 | 캡처 내용 |
|--------|----------|
| `UserPromptSubmit` | 프롬프트와 추출된 토픽 |
| `PostToolUseFailure` | 모든 도구 실패 (에러 분류 포함) |
| `PostToolUse` (Bash) | 성공한 Bash 호출의 빌드/테스트 에러 |
| `SessionStart` | 이전 세션 컨텍스트 주입, 동기화 제안 |
| `Stop` | 세션 마무리, CLAUDE.md 정리, 데이터 아카이브 |
| `PreCompact` | 대화 압축 전 세션 요약 저장 |

`SessionStart`(컨텍스트 주입)을 제외한 모든 hooks는 무음(stdout 없음).

## CLAUDE.md 관리

Handover는 마커 사이의 섹션만 관리합니다 — 기존 내용은 절대 건드리지 않습니다:

```markdown
# 기존 CLAUDE.md 내용...

<!-- HANDOVER:START -->
## Session Context
### Errors
- [02/19] TypeError in src/api/users.ts:45 — null array check
- [02/18] Build: missing @types/node

### Patterns
- Build: `npm run build` (tsup, dist/)
- Test: `npm test` (vitest)
<!-- HANDOVER:END -->
```

**자동 정리**: 7일 이상 된 항목은 제거됩니다. 섹션은 1,000자로 제한됩니다. "Patterns" 하위 섹션(가장 가치 있는)은 항상 보존됩니다.

## 설정

`.handover/config.json`을 생성하여 커스터마이즈:

```json
{
  "maxChars": 1000,
  "pruneAgeDays": 7,
  "maxArchivedSessions": 10
}
```

## 프로젝트 구조

```
handoverAgent/
  .claude-plugin/plugin.json      # 플러그인 매니페스트
  hooks/
    hooks.json                    # Hook 등록
    lib/
      session-store.mjs           # 세션 데이터 저장
      claude-md.mjs               # CLAUDE.md 파싱/업데이트/정리
      error-detector.mjs          # 에러 패턴 감지
    on-prompt.mjs                 # 프롬프트 + 토픽 기록
    on-tool-fail.mjs              # 도구 실패 기록
    on-tool-done.mjs              # 빌드/테스트 에러 감지
    on-session-start.mjs          # 컨텍스트 주입 + 동기화 제안
    on-session-end.mjs            # 마무리 + 정리 + 아카이브
    on-compact.mjs                # 압축 전 요약 저장
  skills/
    init/SKILL.md                 # 프로젝트 분석 + 부트스트랩
    sync/SKILL.md                 # 세션 데이터 → CLAUDE.md
    status/SKILL.md               # 상태 표시
```

## 라이선스

MIT
