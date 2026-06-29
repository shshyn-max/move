# 🏡 임장 스코어보드

부부가 각자 임장(현장 방문) 점수를 매기고, 깃으로 동기화해 종합 순위를 보는 모바일 웹앱.

- **순위 → 점수**: 1순위 10점 · 2순위 5점 · 3순위 3점
- 상단에서 **남편/아내** 선택 → 내 칸만 입력
- **💾 저장**을 누르면 내 점수가 `data/{husband|wife}.md` 로 깃에 업로드되고,
  두 폰이 **🔄 / 종합점수 탭**에서 서로의 최신 점수를 합쳐서 봅니다.

## 배포 (GitHub Pages)
1. 이 폴더를 개인 GitHub 저장소에 올리고 **Settings → Pages** 에서 브랜치(main)/루트로 Pages 활성화.
2. 발급된 `https://<id>.github.io/<repo>/` 를 두 사람이 휴대폰으로 엽니다.

> `index.html` 한 파일이 앱 전부입니다. `server.js`/`package.json` 은 더 이상 필요 없습니다(예전 로컬 서버 방식 잔재).

## 깃 동기화 설정 (두 폰 모두 1회)
앱 우측 상단 **⚙️** 에서 입력:
- **저장소**: `owner/repo` (예: `sh-shin/moving`)
- **브랜치**: `main`
- **토큰**: fine-grained Personal Access Token (해당 저장소 **Contents 읽기/쓰기**)

토큰은 **각 기기 localStorage에만** 저장되고 소스/깃에는 올라가지 않습니다.

### 토큰 발급
github.com → 우상단 프로필 → **Settings** → 좌하단 **Developer settings**
→ **Personal access tokens → Fine-grained tokens** → **Generate new token**
- Resource owner: 본인 계정
- Repository access: **Only select repositories** → 이 저장소 선택
- Permissions → Repository permissions → **Contents: Read and write**
- Generate → `github_pat_...` 복사

저장소가 한 사람 계정에 있으므로, **같은 토큰을 두 폰에 모두 입력**하면 됩니다(한 명이 발급해 카톡으로 공유).

## 버튼
- **💾 저장** — 로컬 저장 + 깃에 내 md 업로드
- **📤 전송하기** — (백업) 카톡 등으로 md 파일 공유
- **🧹 작업완료** — 확인 후 이 기기 로컬 기록 완전 삭제
- **🔄** — 깃에서 최신 점수 불러오기 · **⚙️** — 깃 동기화 설정
