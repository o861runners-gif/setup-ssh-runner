# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-01-28

### 🎉 Major Refactoring

This is a complete rewrite of the setup-ssh tool with significant improvements in architecture, reliability, and user experience.

### Added

- ✨ **Plugin Architecture**: Modular tunnel system allowing easy extension
- ✨ **Structured Errors**: Comprehensive error classes for better error handling
- ✨ **Retry Logic**: Exponential backoff for downloads and network operations
- ✨ **Colored Logging**: Improved CLI output with color support
- ✨ **Progress Indicators**: Visual feedback during operations
- ✨ **Configuration Validation**: Comprehensive ENV validation on startup
- ✨ **Health Checks**: Verify tunnel and SSH server health
- ✨ **Parallel Tunnel Startup**: Start all tunnels simultaneously for faster setup
- ✨ **Binary Caching**: Smart caching to avoid re-downloads
- ✨ **Secure Permissions**: Automatic file permission management
- ✨ **DRY_RUN Mode**: Test configuration without actually running
- ✨ **Template Support**: Custom sshd and cloudflared config templates
- ✨ **Better Timeouts**: Configurable timeouts for all operations
- ✨ **GitHub Packages**: Support for publishing to both npm and GitHub Packages

### Changed

- 🔄 **Modular Code Structure**: Split monolithic file into organized modules
- 🔄 **Configuration Management**: Centralized config with validation
- 🔄 **Logging System**: Structured logging with levels and colors
- 🔄 **Error Handling**: Consistent error handling across all modules
- 🔄 **Documentation**: Comprehensive inline documentation and JSDoc comments

### Fixed

- 🐛 **Race Conditions**: Fixed tunnel startup race conditions
- 🐛 **File Permissions**: Proper permission handling on all platforms
- 🐛 **Error Messages**: Clear, actionable error messages
- 🐛 **Cleanup**: Proper resource cleanup on exit

### Security

- 🔒 **Credential Masking**: Mask sensitive data in logs
- 🔒 **File Permissions**: Enforce secure permissions for SSH files
- 🔒 **Input Validation**: Validate all user inputs

---

## [1.0.0] - 2024-01-15

### Initial Release

- Basic SSH server setup for Linux and Windows
- Support for Pinggy, SSH-J, and Cloudflare tunnels
- Firebase RTDB persistence
- ntfy.sh notifications
- Azure Pipelines and GitHub Actions support

[2.0.0]: https://github.com/YOUR_ORG/setup-ssh-tunnel/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/YOUR_ORG/setup-ssh-tunnel/releases/tag/v1.0.0
