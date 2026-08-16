# Android Worktree (`@kez-lab/android-worktree`)

🚀 **Android 프로젝트를 위한 초고속 Git Worktree 관리 & Gradle 빌드 가속 CLI 도구**

[![CI](https://github.com/kez-lab/android-worktree/actions/workflows/ci.yml/badge.svg)](https://github.com/kez-lab/android-worktree/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

---

## ⚡ 해결하고자 하는 문제

Android 프로젝트에서 여러 브랜치를 동시에 작업하기 위해 `git worktree`를 활용할 때 다음과 같은 비효율과 장애가 발생합니다:

1. **초기 빌드 실패 (누락된 설정)**: `.gitignore` 대상 파일(`local.properties`, `google-services.json`, keystore, 커스텀 API 키 등)이 새 worktree에 없어서 빌드가 즉시 깨집니다.
2. **Gradle Daemon 중복 포크 및 메모리 낭비**: 브랜치 간 `org.gradle.jvmargs`나 Gradle Wrapper 버전이 미세하게 다르면 2~4GB 메모리를 점유하는 JVM Daemon 프로세스가 worktree마다 새로 뜹니다.
3. **빌드 캐시 파편화**: 임의의 캐시 디렉터리를 주입할 경우 머신 전역 캐시(`$GRADLE_USER_HOME/caches/build-cache-1`)와 분리되어 캐시 히트율이 급격히 떨어집니다.
4. **불필요한 전체 컴파일**: 일반 `./gradlew assembleDebug`는 모든 ABI(`arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`)를 전부 빌드하고 린트/테스트까지 실행하여 개발 이터레이션이 느려집니다.

---

## ✨ 핵심 기능

- 🌿 **원클릭 Worktree 생성 (`add` / `create`)**: 깔끔한 폴더 네이밍 룰에 따라 독립 디렉터리에 worktree를 생성합니다.
- 🔑 **자동 시딩 (`seeder`)**: `local.properties`, `google-services.json`, `*.jks`, `secrets.properties`, `.env` 등을 감지하여 새 worktree에 안전하게 자동 복사/동기화합니다.
- 🛡️ **Gradle Daemon 호환성 가드 (`daemon-guard`)**: `gradle.properties`와 `gradle-wrapper.properties`를 검사하여 데몬이 분기되지 않고 재사용되도록 사전에 진단합니다.
- 🏎️ **최적화된 빌드 러너 (`build` / `run`)**:
  - 머신 전역 `--build-cache`를 보존 및 강제 활성화합니다.
  - `adb`로 연결된 실기기/에뮬레이터의 ABI(예: `arm64-v8a`)를 자동 감지하여 `-Pandroid.injected.build.abi=<abi>`를 주입합니다.
  - 개발 중 불필요한 태스크(`-x lint -x testDebugUnitTest`)를 스킵하여 수십 초의 시간을 단축합니다.
- 🩺 **환경 종합 진단 (`doctor`)**: 현재 실행 중인 Gradle Daemon 수, 빌드 캐시 크기, 연결된 디바이스 상태를 한눈에 파악합니다.
- 🧹 **Worktree 생명주기 관리 (`remove`, `list`, `prune`)**: 활성 worktree와 각 `build/` 용량을 조회하고 안전하게 정리합니다.

---

## 📦 설치

```bash
# npm 글로벌 설치
npm install -g @kez-lab/android-worktree

# 또는 npx로 즉시 실행
npx @kez-lab/android-worktree doctor
```

---

## 📖 사용 가이드

### 1. 설정 자동 복사와 함께 Worktree 생성
```bash
# feature 브랜치용 worktree를 생성하고, local.properties 및 secret 파일들을 자동 복사합니다.
android-worktree add feature/login-flow

# 축약 명령어
aw create feature/payment-revamp
```

### 2. 최적화 가속 빌드 실행
```bash
# 연결된 기기 ABI를 자동 감지하고 전역 캐시를 활용하여 초고속 빌드 실행
android-worktree build

# 특정 worktree 디렉터리 대상 빌드
android-worktree build ../MyProject-worktrees/feature-login-flow
```

### 3. 활성 Worktree 목록 및 디스크 사용량 조회
```bash
android-worktree list
```

### 4. Gradle 데몬 및 빌드 캐시 상태 진단
```bash
android-worktree doctor
```

### 5. Worktree 안전 삭제 및 정리
```bash
android-worktree remove feature/login-flow --clean-build
```

---

## 🛠️ CLI 명령어 요약

| 명령어 | 별칭 | 설명 |
|---|---|---|
| `add <branch> [path]` | `create` | Worktree 생성 + 설정 자동 시딩 + 데몬 호환성 검사 |
| `build [path]` | `run` | 전역 캐시 + 타겟 ABI 주입 기반 고속 빌드 실행 |
| `list` | `ls` | 모든 활성 worktree 및 build 디렉터리 용량 조회 |
| `remove <branch>` | `rm` | Worktree 안전 제거 및 잔여 빌드 파일 정리 |
| `seed [targetPath]` | — | 부모 저장소의 `local.properties` 및 시크릿 수동 복사 |
| `doctor` | `diagnose` | Gradle 데몬, 빌드 캐시, 연결 기기 상태 종합 진단 |
| `prune` | — | 만료된 worktree 메타데이터 정리 |

---

## 📄 라이선스

Apache-2.0 © [Kez](https://github.com/kez-lab)
