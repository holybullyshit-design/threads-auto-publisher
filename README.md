# 스레드 자동 게시 앱

여러 개의 Threads 계정(채널)을 등록해두고, 채널마다 고유한 말투/구조("페르소나")를 유지하면서
글감 카테고리를 고르면 초안을 쓰고, 미리보기에서 검토·수정한 뒤 **지금 게시**하거나 **예약 발행**할
수 있는 로컬 웹앱입니다.

예약 발행은 GitHub Actions가 대신 처리하기 때문에 **랩톱이 꺼져 있어도** 예약된 시간에 자동으로
게시됩니다. (이미 실제로 검증됨)

## 0. 전체 구조

```
로컬 앱 (이 프로젝트)          →  계정 관리 / 글쓰기(AI 또는 직접 작성) / "지금 게시" / 예약 등록
     │ 예약 등록 시 GitHub API로 schedule/posts.json에 기록
     ▼
GitHub 저장소 (비공개, holybullyshit-design/threads-auto-publisher)
     │ 10분마다 GitHub Actions 실행
     ▼
GitHub Actions                →  시간이 된 예약 글을 Threads API로 직접 게시
```

- **초안 생성 엔진**: Anthropic API 키가 아니라, 이 컴퓨터에 로그인된 **Claude Code CLI**
  (`claude -p`, 헤드리스 모드)를 그대로 사용합니다. 별도 API 키/결제 설정이 필요 없습니다.
  다만 호출마다 Claude Code 자체의 기본 컨텍스트가 함께 로드되어, 순수 API 호출보다
  호출당 사용량(비용)이 더 큽니다 — 자주 여러 개를 생성할 계획이면 참고해주세요.
- **계정별 Threads Access Token**: 로컬에는 `data/accounts.json`(git 제외), 클라우드에는
  GitHub Actions 시크릿 `THREADS_ACCOUNTS_JSON`에 저장됩니다.
- **예약 글 목록(schedule/posts.json)**: 계정 토큰이 아니라 글 내용 + 예약 시각만 담기므로,
  비공개 저장소에 커밋되는 형태로 관리됩니다.

## 1. 최초 설정 (로컬)

```bash
npm install
cp .env.example .env
```

`.env`에 아래 값을 채워주세요 (이미 이 프로젝트는 설정 완료된 상태입니다).

| 변수 | 설명 |
|---|---|
| `GITHUB_REPO` | 예약 글을 저장할 저장소 (`아이디/저장소이름`) |
| `GITHUB_TOKEN` | 그 저장소에 대한 Contents Read/write 권한이 있는 토큰 |
| `PORT` | 로컬 서버 포트 (기본 4321) |

Threads 계정(여러 개)은 `.env`가 아니라 **앱을 실행한 뒤 "계정 관리" 탭**에서 등록합니다.
Claude Code 로그인 여부는 터미널에서 `claude /status` 또는 그냥 `claude`로 확인할 수 있습니다.

## 2. 클라우드 예약 발행 설정 (최초 1회 — 이미 완료됨)

### 2-1. GitHub CLI 로그인
```bash
gh auth login
```

### 2-2. 비공개 저장소 생성 + 푸시
```bash
git init
git add .
git commit -m "init: threads auto publisher"
gh repo create threads-auto-publisher --private --source=. --remote=origin --push
```

### 2-3. 로컬 앱용 GitHub 토큰
`gh auth token` (GitHub CLI 로그인 토큰, repo/workflow 권한 포함)을 그대로 `.env`의
`GITHUB_TOKEN`으로 사용 중입니다. 더 좁은 권한을 원하면, 이 저장소 하나에만 Contents
Read/write 권한을 준 Fine-grained PAT( https://github.com/settings/personal-access-tokens/new )
으로 교체해도 됩니다.

### 2-4. Threads 계정을 GitHub Actions 시크릿으로 등록
1. 앱의 "계정 관리" 탭에서 Threads 계정을 등록 (또는 수정)
2. 같은 화면의 "시크릿용 JSON 다운로드" 버튼으로 파일 받기
3. 터미널에서 직접 실행 (토큰이 담긴 파일이므로 본인이 직접 실행):
   ```bash
   gh secret set THREADS_ACCOUNTS_JSON --repo holybullyshit-design/threads-auto-publisher < ~/Downloads/threads-accounts-secret.json
   ```
4. 등록 후에는 다운로드한 파일을 삭제하는 걸 권장합니다.
5. **계정을 추가/삭제/토큰 변경할 때마다 위 과정을 반복**해서 시크릿을 최신 상태로 유지해주세요
   (안 하면 클라우드 쪽은 예전 토큰으로 게시를 시도해서 실패합니다).

## 3. 실행

### 터미널에서
```bash
npm start
# 또는
bash scripts/start.sh
```
서버가 뜨면 자동으로 기본 브라우저가 `http://localhost:4321`을 엽니다.

### 바탕화면 아이콘(.app)으로
```bash
bash macapp/build-app.sh
```
바탕화면에 **"스레드 자동 게시.app"** 이 생성됩니다. 더블클릭하면 터미널 창이 열리며 서버가 실행되고,
브라우저가 자동으로 열립니다.

## 4. 사용 흐름

1. **계정 관리 탭**: Threads 계정을 등록하면서 그 채널만의 카테고리/말투/구조/CTA/클로징 문구를
   "페르소나"로 함께 저장 (연리지 실타래형 / 아해사주형 / 팔자명가형 템플릿 제공, 자유 수정 가능)
2. **글쓰기 탭 - 설정**: 계정(채널) 선택 → 그 채널의 카테고리 중 선택 →
   - **✦ 초안 생성 (AI)**: Claude Code가 그 채널의 페르소나에 맞는 초안을 작성
   - **✎ 직접 작성 (AI 없이)**: 빈 미리보기로 바로 이동해서 스스로 작성
3. **글쓰기 탭 - 미리보기**: 내용 자유롭게 수정, "이 채널 톤으로 다시 다듬기"로 AI 재정렬 가능
4. **발행 방식 선택**:
   - **지금 게시**: 확인창 이후 즉시 Threads에 게시
   - **예약 발행**: 날짜/시간 지정 → GitHub 저장소에 기록되고, 그 시각이 되면 GitHub Actions가 자동 게시
5. **예약 목록 탭**: 계정별 예약/게시완료/실패 이력 확인, 예약 취소 가능 (새로고침 버튼으로 최신 상태 확인)

이 흐름은 "완전 자동(풀오토) 게시"가 아니라, **AI가 초안을 만들면 사람이 검토·수정하고 나서
게시/예약을 확정**하는 반자동 구조입니다. AI 생성 없이 계정 관리·예약·게시만 쓰는 것도 가능합니다.

## 5. 프로젝트 구조

```
server/
  index.js                    # Express 서버 + API 라우트
  config/personaPresets.js     # 계정 추가 시 고를 수 있는 페르소나 템플릿 3종
  lib/claudeCliEngine.js       # 초안 생성 엔진 (claude -p 헤드리스 호출)
  lib/threadsClient.js         # Threads Graph API 연동 (컨테이너 생성 → 게시)
  lib/accountsStore.js         # 로컬 계정+페르소나 저장소 (data/accounts.json)
  lib/githubStore.js           # schedule/posts.json을 GitHub Contents API로 읽기/쓰기
  lib/scheduleStore.js         # 예약 글 CRUD
  skills/sajuDraftWriter.js    # "초안 생성" 스킬 프롬프트 (계정 페르소나 기반)
  skills/sajuToneRewriter.js   # "톤 다듬기" 스킬 프롬프트 (계정 페르소나 기반)
public/
  index.html / style.css / app.js   # 글쓰기 / 예약 목록 / 계정 관리 탭 (다크 사주 테마)
cloud/
  publish-scheduled.js         # GitHub Actions가 실행하는 예약 발행 스크립트
.github/workflows/
  publish-scheduled.yml        # 10분마다 예약 글을 확인/게시하는 워크플로
schedule/
  posts.json                   # 예약/게시 이력 (git에 커밋됨, 토큰은 없음)
macapp/
  build-app.sh                 # 바탕화면 .app 생성 스크립트
scripts/start.sh                # 터미널 실행용 스크립트
```

## 6. 보안 메모

- `data/accounts.json`, `.env`는 `.gitignore`에 등록되어 있어 커밋되지 않습니다.
- `schedule/posts.json`은 저장소에 커밋되지만 계정 토큰은 포함하지 않습니다 (글 내용 + 시각만).
- Threads 액세스 토큰은 로컬 파일과 GitHub Actions 암호화 시크릿, 두 곳에만 존재합니다.
- Threads 텍스트 게시물은 500자 제한이 있습니다. 미리보기에서 실시간 글자 수를 표시하며,
  초과 시 서버/클라우드 스크립트 모두에서 게시를 거부합니다.
- 계정 관리 탭에 등록하는 Threads Access Token은 실제 값이며, 지금 들어있는 3개 계정(연리지
  실타래/아해사주/팔자명가)은 페르소나 템플릿 테스트용 **더미 토큰**입니다. 실제 게시 전에
  진짜 토큰으로 교체해주세요.
