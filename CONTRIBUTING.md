# Contributing to Android Worktree (`@kez-lab/android-worktree`)

First off, thank you for considering contributing to `android-worktree`! 🎉

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kez-lab/android-worktree.git
   cd android-worktree
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run tests in watch mode**:
   ```bash
   npm run test:watch
   ```

4. **Type check & Build**:
   ```bash
   npm run typecheck
   npm run build
   ```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `test:` Adding or refactoring tests
- `refactor:` Code refactoring without behavioral changes
- `chore:` Maintenance, toolchain, or dependency updates

## Pull Request Process

1. Create a feature branch (`git checkout -b feat/my-new-feature`).
2. Ensure all tests pass (`npm run test`) and type checking succeeds (`npm run typecheck`).
3. Commit your changes and push to your fork.
4. Open a Pull Request referencing any related issues.
