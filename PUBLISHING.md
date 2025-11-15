# NPM Publishing Checklist

Your package `@tsflow/flow-engine` is ready to publish! Follow these steps:

## ✅ Pre-Publishing Checklist

- [x] Package.json configured with all required fields
- [x] README.md created for package
- [x] LICENSE file added (MIT)
- [x] .npmignore configured to include only dist files
- [x] Build succeeds (`npm run build`)
- [x] All tests pass (162 tests ✅)
- [x] TypeScript declarations generated
- [x] Package size optimized (31.2 kB)

## 📦 Package Details

- **Name**: `@tsflow/flow-engine`
- **Version**: `0.0.1`
- **Size**: 31.2 kB (gzipped: ~6.23 kB)
- **Files**: 15 files (dist/ + README + LICENSE)
- **Node**: >=18

## 🔧 Before Publishing

### 1. Update Author Information

Edit `packages/flow-engine/package.json`:

```json
"author": "Your Name <your.email@example.com>",
"repository": {
  "type": "git",
  "url": "https://github.com/YOUR-USERNAME/tsFlow.git",
  "directory": "packages/flow-engine"
},
"bugs": {
  "url": "https://github.com/YOUR-USERNAME/tsFlow/issues"
},
"homepage": "https://github.com/YOUR-USERNAME/tsFlow#readme"
```

### 2. Update README Links

Edit `packages/flow-engine/README.md` to replace:
- `https://github.com/yourusername/tsFlow` → Your actual GitHub URL

### 3. Update License

Edit `packages/flow-engine/LICENSE`:
- Replace `[Your Name]` with your actual name

## 🚀 Publishing Steps

### First Time Setup

1. **Create NPM Account** (if you don't have one):
   ```bash
   # Visit https://www.npmjs.com/signup
   ```

2. **Login to NPM**:
   ```bash
   npm login
   ```

3. **Verify Login**:
   ```bash
   npm whoami
   ```

### Publishing

1. **Navigate to Package Directory**:
   ```bash
   cd packages/flow-engine
   ```

2. **Verify Package Contents**:
   ```bash
   npm pack --dry-run
   ```

3. **Run Pre-Publish Checks** (automatic via `prepublishOnly`):
   ```bash
   npm run prepublishOnly
   # Runs: build + test
   ```

4. **Publish to NPM**:

   For scoped package (first time):
   ```bash
   npm publish --access public
   ```

   For subsequent publishes:
   ```bash
   npm publish
   ```

### Version Management

Follow semantic versioning (semver):

- **Patch** (bug fixes): `npm version patch` → 0.0.2
- **Minor** (new features): `npm version minor` → 0.1.0
- **Major** (breaking changes): `npm version major` → 1.0.0

Then publish:
```bash
npm version patch
npm publish
```

## 📋 Post-Publishing

1. **Verify Package on NPM**:
   ```
   https://www.npmjs.com/package/@tsflow/flow-engine
   ```

2. **Test Installation**:
   ```bash
   mkdir test-install
   cd test-install
   npm init -y
   npm install @tsflow/flow-engine
   ```

3. **Update Root README** with installation instructions

4. **Create GitHub Release**:
   - Tag: `v0.0.1`
   - Title: `@tsflow/flow-engine v0.0.1`
   - Description: Initial release

## 🔒 Package Access

Your package is scoped (`@tsflow/flow-engine`). By default, scoped packages are **private**.

To make it **public** (free), use:
```bash
npm publish --access public
```

## 📊 What's Included in Package

```
@tsflow/flow-engine@0.0.1
├── dist/
│   ├── index.js (30.8 kB)
│   ├── index.d.ts
│   ├── flow-engine.d.ts
│   ├── state-machine.d.ts
│   ├── storage.d.ts
│   ├── yaml-parser.d.ts
│   └── *.map files
├── README.md
└── LICENSE
```

## 🚫 What's Excluded (via .npmignore)

- Source files (`src/`)
- Tests (`__tests__/`)
- Examples (`examples/`)
- Configuration files (tsconfig, vite.config, etc.)
- Node modules
- Build artifacts (.turbo, test-output.txt)

## 🎯 Installation for Users

After publishing, users can install with:

```bash
npm install @tsflow/flow-engine
```

And use it:

```typescript
import { FlowEngine, StateMachineConfig } from '@tsflow/flow-engine';

const engine = new FlowEngine(config);
```

## 🔄 Update Workflow

For future updates:

1. Make changes
2. Update tests
3. Run `npm test`
4. Update version: `npm version patch|minor|major`
5. Update CHANGELOG.md (optional)
6. Commit changes: `git commit -am "Release v0.0.2"`
7. Push: `git push && git push --tags`
8. Publish: `npm publish`

## 📚 Next Steps

1. Update author/repository information in package.json
2. Update README links
3. Update LICENSE with your name
4. Run `npm login`
5. Run `npm publish --access public`
6. Celebrate! 🎉

---

**Ready to publish?** Make sure to update the author information first!
