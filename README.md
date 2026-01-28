# 🔐 setup-ssh-tunnel

> **Automated SSH server setup with tunneling for CI/CD environments**

[![npm version](https://img.shields.io/npm/v/@YOUR_ORG/setup-ssh-tunnel.svg)](https://www.npmjs.com/package/@YOUR_ORG/setup-ssh-tunnel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://github.com/YOUR_ORG/setup-ssh-tunnel/workflows/Tests/badge.svg)](https://github.com/YOUR_ORG/setup-ssh-tunnel/actions)

Automatically setup SSH server and create public tunnels in CI/CD pipelines (Azure Pipelines, GitHub Actions, etc.) for remote debugging and access.

---

## ✨ Features

- 🚀 **Zero-config** SSH server setup (user-mode & root-mode)
- 🌐 **Multiple tunnels**: Pinggy, SSH-J, Cloudflare
- 🔄 **Auto-detection**: CI environment, default working directory
- 🔒 **Secure**: Public key authentication only
- 📦 **No dependencies**: Uses only Node.js built-ins
- 🎯 **Cross-platform**: Linux, Windows support
- 🔌 **Plugin architecture**: Easy to extend with new tunnels
- ⚡ **Parallel startup**: Fast tunnel initialization
- 🛡️ **Robust**: Retry logic with exponential backoff
- 📊 **Structured logging**: Beautiful colored output

---

## 📋 Quick Start

### Installation

```bash
# npm
npm install -g @YOUR_ORG/setup-ssh-tunnel

# npx (no install needed)
npx @YOUR_ORG/setup-ssh-tunnel

# GitHub Packages
npm install -g @YOUR_ORG/setup-ssh-tunnel --registry=https://npm.pkg.github.com
```

### Usage

#### 1. Generate SSH Key Pair

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ci_key -N "" -C "ci-pipeline"
```

#### 2. Set Environment Variables

```bash
export PIPELINE_SSH_PUBKEY="$(cat ~/.ssh/ci_key.pub)"
export SSH_PORT=2222
export PINGGY_ENABLE=1
```

#### 3. Run

```bash
npx @YOUR_ORG/setup-ssh-tunnel
```

---

## 🎯 Use Cases

### Azure Pipelines

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '18.x'

  - script: |
      npx @YOUR_ORG/setup-ssh-tunnel
    displayName: 'Setup SSH Tunnel'
    env:
      PIPELINE_SSH_PUBKEY: $(PIPELINE_SSH_PUBKEY)
      SSH_PORT: 2222
      PINGGY_ENABLE: 1

  - script: |
      echo "SSH tunnel is running..."
      echo "Connect: $(PINGGY_ENDPOINT)"
    displayName: 'Show connection info'
```

### GitHub Actions

```yaml
# .github/workflows/ssh-debug.yml
name: SSH Debug

on: [workflow_dispatch]

jobs:
  setup-ssh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Setup SSH Tunnel
        run: npx @YOUR_ORG/setup-ssh-tunnel
        env:
          PIPELINE_SSH_PUBKEY: ${{ secrets.PIPELINE_SSH_PUBKEY }}
          SSH_PORT: 2222
          SSHJ_ENABLE: 1

      - name: Keep alive
        run: sleep 3600
```

---

## 🌍 Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `PIPELINE_SSH_PUBKEY` | SSH public key for authentication (required) |

### Optional Environment Variables

#### SSH Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `SSH_PORT` | `2222` | SSH server port |
| `SSH_MODE` | `auto` | Mode: `auto`, `user`, `root` |
| `SSH_ALLOW_USERS` | `${USER}` | Allowed users (space-separated) |
| `SSH_DEFAULT_CWD` | Auto-detect | Default working directory |
| `SSH_DISABLE_FORCE_CWD` | `0` | Disable forced CWD (set to `1`) |

#### Tunnel Configuration

**Pinggy**
| Variable | Description |
|----------|-------------|
| `PINGGY_ENABLE` | Set to `1` to enable |
| `PINGGY_FOREGROUND` | Set to `1` for foreground mode |
| `PINGGY_TARGET_HOST` | Target host (default: `localhost`) |
| `PINGGY_TARGET_PORT` | Target port (default: SSH_PORT) |
| `PINGGY_REGION_HOST` | Pinggy region (default: `a.pinggy.io`) |

**SSH-J**
| Variable | Description |
|----------|-------------|
| `SSHJ_ENABLE` | Set to `1` to enable |
| `SSHJ_FOREGROUND` | Set to `1` for foreground mode |
| `SSHJ_HOST` | SSH-J host (default: `ssh-j.com`) |
| `SSHJ_NAMESPACE` | Custom namespace (optional) |
| `SSHJ_DEVICE` | Custom device name (optional) |

**Cloudflare**
| Variable | Description |
|----------|-------------|
| `CF_ENABLE` | Set to `1` to enable |
| `CLOUDFLARED_APIKEY` | Cloudflare API key (required if enabled) |
| `CLOUDFLARED_TUNNEL_NAME` | Custom tunnel name (optional) |
| `CLOUDFLARED_FOREGROUND` | Set to `1` for foreground mode |

#### Persistence
| Variable | Description |
|----------|-------------|
| `ENV_SSH_URLS` | Firebase RTDB URL for storing tunnel URLs |
| `ENV_SSH_URLS_ID` | ID for storing in RTDB |
| `ENV_NTFY_TOPIC` | ntfy.sh topic for notifications |

---

## 🔧 Advanced Usage

### Programmatic API

```javascript
const setupSsh = require('@YOUR_ORG/setup-ssh-tunnel');

(async () => {
  try {
    const result = await setupSsh.run({
      sshPort: '2222',
      sshMode: 'user',
      publicKey: 'ssh-ed25519 AAAA...',
      tunnels: {
        pinggy: { enabled: true },
        sshj: { enabled: true },
        cloudflare: { enabled: false },
      },
    });

    console.log('SSH Port:', result.ssh.port);
    console.log('Tunnels:', result.tunnels);
  } catch (err) {
    console.error('Setup failed:', err);
  }
})();
```

### Custom Templates

Set custom SSHD or Cloudflared configs:

```bash
# Base64 encoded template
export SSHD_CONFIG_TEMPLATE="$(cat my_sshd_config.template | base64)"

# Or raw text
export SSHD_CONFIG_TEMPLATE="Port {{PORT}}
ListenAddress {{LISTEN_ADDRESS}}
..."
```

### Multiple SSH Keys

```bash
export PIPELINE_SSH_PUBKEY="ssh-ed25519 AAAA... key1
ssh-rsa AAAA... key2
ecdsa-sha2-nistp256 AAAA... key3"
```

---

## 🏗️ Architecture

### v2.0 Plugin System

```
┌─────────────────────────────────────────┐
│           Main Orchestrator             │
│         (lib/index.js)                  │
└──────────┬──────────────────────────────┘
           │
           ├─► Config Validation
           │
           ├─► SSH Setup (lib/setup-ssh.js)
           │   ├─► Linux User Mode
           │   ├─► Linux Root Mode
           │   └─► Windows Mode
           │
           ├─► Tunnel Manager (Parallel)
           │   ├─► Pinggy (lib/tunnels/pinggy.js)
           │   ├─► SSH-J (lib/tunnels/sshj.js)
           │   └─► Cloudflare (lib/tunnels/cloudflare.js)
           │
           ├─► Persistence (lib/persistence.js)
           │   ├─► Firebase RTDB
           │   └─► ntfy.sh
           │
           └─► Summary Report
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run integration tests
npm run test:integration

# Run linter
npm run lint

# Format code
npm run format
```

---

## 📊 Comparison: v1.0 vs v2.0

| Feature | v1.0 | v2.0 |
|---------|------|------|
| Code Structure | Monolithic (1363 lines) | Modular (15+ files) |
| Error Handling | Basic | Structured error classes |
| Retry Logic | None | Exponential backoff |
| Logging | Plain text | Colored, structured |
| Tunnel Startup | Sequential | Parallel |
| Testing | None | Comprehensive |
| Documentation | Basic | JSDoc + guides |
| Plugin System | ❌ | ✅ |
| Type Safety | ❌ | JSDoc annotations |
| CI/CD | Manual | Automated workflows |

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/YOUR_ORG/setup-ssh-tunnel.git
cd setup-ssh-tunnel
npm install
npm test
```

---

## 📄 License

MIT © [YOUR_NAME](https://github.com/YOUR_ORG)

---

## 🙏 Credits

- [OpenSSH Project](https://www.openssh.com/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Pinggy.io](https://pinggy.io/)
- [SSH-J.com](https://ssh-j.com/)

---

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/YOUR_ORG/setup-ssh-tunnel/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/YOUR_ORG/setup-ssh-tunnel/discussions)
- 📧 **Email**: YOUR_EMAIL

---

**Made with ❤️ for DevOps engineers**
