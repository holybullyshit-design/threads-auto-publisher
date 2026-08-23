# 스레드 자동 게시 앱

여러 개의 Threads 계정을 등록해두고, 사주(재회 / 궁합 / 이혼 / 부부운) 카테고리 + 톤을 고르면
Claude가 초안을 쓰고, 미리보기에서 수정한 뒤 **지금 게시**하거나 **예약 발행**할 수 있는 로컬 웹앱입니다.

예약 발행은 GitHub Actions가 대신 처리하기 때문에 **랩톱이 꺼져 있어도** 예약된 시간에 자동으로 게시됩니다.

## 0. 전체 구조

```
로컬 앱 (이 프로젝트)          →  계정 관리 / 글쓰기 / "지금 게시" / 예약 등록
     │ 예약 등록 시 GitHub API로 schedule/posts.json에 기록
     ▼
GitHub 저장소 (비공개)         →  schedule/posts.json 저장
     │ 10분마다 GitHub Actions 실행
     ▼
GitHub Actions                →  시간이 된 예약 글을 Threads API로 직접 게시
```

- **계정별 Threads Access Token**: 로컬에는 `data/accounts.json`(git 제외), 클라우드에는
  GitHub Actions 시크릿 `THREADS_ACCOUNTS_JSON`에 저장됩니다.
- **예약 글 목록(schedule/posts.json)**: 계정 토큰이 아니라 글 내용 + 예약 시각만 담기므로,
  비공개 저장소에 커밋되는 형태로 관리됩니다.

## 1. 최초 설정 (로컬)

```bash
npm install
cp .env.example .env
```

`.env`에 아래 값을 채워주세요.

| 변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys)에서 발급 |
| `ANTHROPIC_MODEL` | 기본값(`claude-sonnet-5`) 그대로 두면 됩니다 |
| `GITHUB_REPO` | 아래 "2. 클라우드 예약 발행 설정"에서 만들 저장소 (`아이디/저장소이름`) |
| `GITHUB_TOKEN` | 그 저장소에 대한 Contents Read/write PAT |
| `PORT` | 로컬 서버 포트 (기본 4321) |

Threads 계정(여러 개)은 `.env`가 아니라 **앱을 실행한 뒤 "계정 관리" 탭**에서 등록합니다.

## 2. 클라우드 예약 발행 설정 (최초 1회)

### 2-1. GitHub CLI 로그인
```bash
gh auth login
```
GitHub.com → HTTPS → 브라우저로 로그인 순서로 진행하면 됩니다.

### 2-2. 비공개 저장소 생성 + 푸시
프로젝트 폴더에서:
```bash
git init
git add .
git commit -m "init: threads auto publisher"
gh repo create threads-auto-publisher --private --source=. --remote=origin --push
```
생성된 저장소 이름(`내깃헙아이디/threads-auto-publisher`)을 `.env`의 `GITHUB_REPO`에 넣어주세요.

### 2-3. 로컬 앱용 GitHub 토큰 발급
로컬 앱이 `schedule/posts.json`을 읽고 쓸 수 있도록 Fine-grained PAT을 만듭니다.
1. https://github.com/settings/personal-access-tokens/new 접속
2. Repository access → 방금 만든 저장소만 선택
3. Permissions → **Contents: Read and write**
4. 발급된 토큰을 `.env`의 `GITHUB_TOKEN`에 넣기

### 2-4. Threads 계정을 GitHub Actions 시크릿으로 등록
1. 앱을 실행하고 "계정 관리" 탭에서 Threads 계정을 등록
2. 같은 화면의 "시크릿용 JSON 다운로드" 버튼으로 파일을 받기
3. 터미널에서 (본인이 직접 실행 — 토큰이 담긴 파일이라 제가 대신 실행하지 않습니다):
   ```bash
   gh secret set THREADS_ACCOUNTS_JSON --repo 내깃헙아이디/threads-auto-publisher < ~/Downloads/threads-accounts-secret.json
   ```
4. 등록 후에는 다운로드한 파일을 삭제하는 걸 권장합니다.
5. 계정을 추가/삭제할 때마다 2~3번을 반복해서 시크릿을 최신 상태로 유지해주세요.

> 이 시크릿은 GitHub Actions가 예약된 글을 대신 게시할 때만 사용되며,
> 저장소 코드나 로그에는 노출되지 않습니다.

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

1. **계정 관리 탭**: Threads 계정을 별명과 함께 등록 (여러 개 가능)
2. **글쓰기 탭 - 설정**: 계정 · 카테고리(재회/궁합/이혼/부부운) · 톤 선택 → **초안 생성**
   - `saju-draft-writer`가 카테고리에 맞는 초안을 쓰고, `saju-tone-rewriter`가 선택한 톤으로 다듬습니다.
3. **글쓰기 탭 - 미리보기**: 내용 수정 가능, 톤 재적용 가능
4. **발행 방식 선택**:
   - **지금 게시**: 확인창 이후 즉시 Threads에 게시
   - **예약 발행**: 날짜/시간 지정 → GitHub 저장소에 기록되고, 그 시각이 되면 GitHub Actions가 자동 게시
5. **예약 목록 탭**: 계정별 예약/게시완료/실패 이력 확인, 예약 취소 가능 (새로고침 버튼으로 최신 상태 확인)

## 5. 프로젝트 구조

```
server/
  index.js                    # Express 서버 + API 라우트
  config/options.js            # 카테고리/톤 목록 (여기서 항목 추가/수정)
  lib/anthropicClient.js       # Claude API 공용 호출 헬퍼
  lib/threadsClient.js         # Threads Graph API 연동 (컨테이너 생성 → 게시)
  lib/accountsStore.js         # 로컬 계정 저장소 (data/accounts.json)
  lib/githubStore.js           # schedule/posts.json을 GitHub Contents API로 읽기/쓰기
  lib/scheduleStore.js         # 예약 글 CRUD
  skills/sajuDraftWriter.js    # "초안 생성" 스킬 프롬프트
  skills/sajuToneRewriter.js   # "톤 변환" 스킬 프롬프트
public/
  index.html / style.css / app.js   # 글쓰기 / 예약 목록 / 계정 관리 탭
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
