# 🚀 Publishing Setup Guide

## 📋 Prerequisites

1. **npm Account**: https://www.npmjs.com/signup
2. **GitHub Account**: https://github.com
3. **Git installed and configured**
4. **Node.js >= 14**

---

## 🔑 Step 1: Configure npm Token

### 1.1 Generate npm Access Token

1. Login to npm: https://www.npmjs.com
2. Go to: **Account → Access Tokens**
3. Click "Generate New Token" → **Automation**
4. Copy the token (starts with `npm_...`)

### 1.2 Add Token to GitHub Secrets

1. Go to your GitHub repo: `https://github.com/YOUR_ORG/setup-ssh-tunnel`
2. Navigate to: **Settings → Secrets and variables → Actions**
3. Click "New repository secret"
4. Name: `NPM_TOKEN`
5. Value: Paste your npm token
6. Click "Add secret"

---

## 🔧 Step 2: Update Configuration

### 2.1 Update `package.json`

Replace all instances of:
- `YOUR_ORG` → Your npm organization or username
- `YOUR_NAME` → Your name
- `YOUR_EMAIL` → Your email

```bash
# Using sed (Linux/macOS)
sed -i 's/YOUR_ORG/your-npm-org/g' package.json
sed -i 's/YOUR_NAME/Your Name/g' package.json
sed -i 's/YOUR_EMAIL/your@email.com/g' package.json

# Or manually edit package.json
```

### 2.2 Update Workflows

In `.github/workflows/`:
- `publish-npm.yml`
- `publish-github.yml`

Replace `YOUR_ORG` with your organization name.

### 2.3 Update .npmrc (if publishing to GitHub Packages)

Uncomment and update:
```
@YOUR_ORG:registry=https://npm.pkg.github.com
```

---

## 📦 Step 3: Publish to npm

### Option A: Automatic (via GitHub Actions - Recommended)

1. **Commit and push your changes**
   ```bash
   git add .
   git commit -m "chore: prepare for npm publish"
   git push origin main
   ```

2. **Trigger workflow manually**
   - Go to: **Actions → Publish to npm**
   - Click "Run workflow"
   - Select version bump: `patch`, `minor`, or `major`
   - Click "Run workflow"

3. **Verify publication**
   - Check: https://www.npmjs.com/package/@YOUR_ORG/setup-ssh-tunnel

### Option B: Manual

```bash
# Login to npm
npm login

# Test package
npm pack
tar -tzf setup-ssh-tunnel-*.tgz

# Dry run
npm publish --dry-run

# Publish
npm publish --access public

# Create git tag
git tag v2.0.0
git push origin v2.0.0
```

---

## 📦 Step 4: Publish to GitHub Packages

### 4.1 Enable GitHub Packages

GitHub Packages is automatically available. Just ensure your repository is public or you have proper permissions.

### 4.2 Publish via Workflow

1. **Trigger workflow**
   - Go to: **Actions → Publish to GitHub Packages**
   - Click "Run workflow"
   - Click "Run workflow"

2. **Verify publication**
   - Go to your repo
   - Click "Packages" tab on the right sidebar
   - You should see `setup-ssh-tunnel`

### 4.3 Install from GitHub Packages

Users need to configure `.npmrc`:

```bash
# .npmrc
@YOUR_ORG:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=GITHUB_TOKEN
```

Then:
```bash
npm install @YOUR_ORG/setup-ssh-tunnel
```

---

## 🔄 Step 5: Version Management

### Semantic Versioning

- **Patch** (1.0.x): Bug fixes
- **Minor** (1.x.0): New features (backward compatible)
- **Major** (x.0.0): Breaking changes

### Manual Version Bump

```bash
# Patch
npm version patch -m "fix: bug description"

# Minor
npm version minor -m "feat: new feature description"

# Major
npm version major -m "BREAKING: breaking change description"

# Push tags
git push --follow-tags
```

---

## ✅ Step 6: Verify Installation

### Test from npm

```bash
# Install globally
npm install -g @YOUR_ORG/setup-ssh-tunnel

# Test CLI
setup-ssh --help

# Test programmatically
node -e "const ssh = require('@YOUR_ORG/setup-ssh-tunnel'); console.log(ssh);"
```

### Test from GitHub Packages

```bash
# Configure .npmrc
echo "@YOUR_ORG:registry=https://npm.pkg.github.com" >> .npmrc

# Install
npm install @YOUR_ORG/setup-ssh-tunnel

# Test
setup-ssh --help
```

---

## 🎯 Quick Checklist

- [ ] npm account created
- [ ] NPM_TOKEN added to GitHub secrets
- [ ] Updated package.json (org, name, email)
- [ ] Updated GitHub workflows
- [ ] Committed and pushed changes
- [ ] Triggered "Publish to npm" workflow
- [ ] Verified package on npmjs.com
- [ ] (Optional) Published to GitHub Packages
- [ ] Tested installation from npm
- [ ] Updated CHANGELOG.md

---

## 🔍 Troubleshooting

### "403 Forbidden" when publishing

**Cause**: No permission or org doesn't exist

**Solution**:
1. Check org name in package.json
2. Ensure you're a member of the npm org
3. Verify NPM_TOKEN has publish permission

### "Package name taken"

**Solution**: Change package name in package.json to something unique

### "ENEEDAUTH" error

**Solution**: 
```bash
npm login
# Or set token
npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN
```

### GitHub Actions workflow fails

**Solution**:
1. Check workflow logs
2. Verify NPM_TOKEN is set correctly
3. Ensure tests pass locally: `npm test`

---

## 📚 Additional Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [GitHub Packages Guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

---

## 🎉 Success!

Your package is now published and ready to use! 🚀

Users can install it with:
```bash
npm install -g @YOUR_ORG/setup-ssh-tunnel
```

Or use in CI/CD:
```bash
npx @YOUR_ORG/setup-ssh-tunnel
```
