# Android Worktree (`@kez-lab/android-worktree`)

🚀 **High-performance Git worktree & Gradle build accelerator for Android projects.**

[![CI](https://github.com/kez-lab/android-worktree/actions/workflows/ci.yml/badge.svg)](https://github.com/kez-lab/android-worktree/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

---

## ⚡ The Problem

When working with `git worktree` in Android projects to parallelize branch workflows:
1. **Broken Initial Builds**: `.gitignore` files (`local.properties`, `google-services.json`, keystores, custom API keys) are missing in newly created worktrees, causing immediate build failures.
2. **Daemon Forking & Memory Exhaustion**: Minor mismatches in `org.gradle.jvmargs` or Gradle Wrapper versions across branches fork separate 2–4 GB JVM Daemon processes.
3. **Build Cache Fragmentation**: Custom or misplaced cache directories split cache entries rather than leveraging the machine-wide `$GRADLE_USER_HOME/caches/build-cache-1`.
4. **Redundant Compilation**: Standard `./gradlew assembleDebug` compiles and packages all ABIs (`arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`) and runs unnecessary verification tasks during rapid local iteration.

---

## ✨ Features

- 🌿 **Instant Worktree Creation (`add` / `create`)**: Creates worktrees with a clean naming convention outside the main directory.
- 🔑 **Zero-Config Auto-Seeding (`seeder`)**: Discovers and seeds `local.properties`, `google-services.json`, `*.jks`, `secrets.properties`, and `.env` files into the worktree.
- 🛡️ **Daemon Compatibility Guard**: Analyzes `gradle.properties` and `gradle-wrapper.properties` to ensure Gradle Daemons are reused across worktrees without spawning duplicate JVM processes.
- 🏎️ **Accelerated Gradle Runner (`build` / `run`)**:
  - Automatically activates machine-wide `--build-cache`.
  - Auto-detects connected device/emulator via `adb` and injects `-Pandroid.injected.build.abi=<abi>`.
  - Skips non-critical dev verification tasks (`-x lint -x testDebugUnitTest`).
- 🩺 **Environment Health Diagnostics (`doctor`)**: Inspects active Gradle Daemons, build cache size, and connected devices.
- 🧹 **Worktree & Cache Lifecycle Management (`remove`, `list`, `prune`)**: Lists active worktrees with disk usage stats and safely cleans up old branches.

---

## 📦 Installation

```bash
# Global installation via npm
npm install -g @kez-lab/android-worktree

# Or run directly via npx
npx @kez-lab/android-worktree doctor
```

---

## 📖 Usage

### 1. Create a new Worktree with Auto-Seeding
```bash
# Creates a worktree for feature branch, copies local.properties & secrets, and checks daemon compatibility
android-worktree add feature/login-flow

# Alias
aw create feature/payment-revamp
```

### 2. Run Optimized Fast Build
```bash
# Automatically connects to your device/emulator, injects single ABI, and hits machine-wide cache
android-worktree build

# Target a specific worktree directory
android-worktree build ../MyProject-worktrees/feature-login-flow
```

### 3. List Active Worktrees & Disk Usage
```bash
android-worktree list
```

### 4. Diagnose Gradle Daemons & Build Cache
```bash
android-worktree doctor
```

### 5. Remove Worktree & Cleanup
```bash
android-worktree remove feature/login-flow --clean-build
```

---

## 🛠️ CLI Reference

| Command | Alias | Description |
|---|---|---|
| `add <branch> [path]` | `create` | Create a worktree with auto-seeding & daemon compatibility check |
| `build [path]` | `run` | Run optimized Gradle build with machine-wide cache & ABI injection |
| `list` | `ls` | List all active worktrees with build cache usage |
| `remove <branch>` | `rm` | Safely remove worktree and optional build leftovers |
| `seed [targetPath]` | — | Manually seed `local.properties` and secrets into target directory |
| `doctor` | `diagnose` | Inspect Gradle Daemons, build cache, and connected devices |
| `prune` | — | Prune stale worktree metadata records |

---

## 📄 License

Apache-2.0 © [Kez](https://github.com/kez-lab)
