# Node-Terraform (ntf)

[![npm version](https://badge.fury.io/js/%40robertforster%2Fnodeterraform.svg)](https://badge.fury.io/js/%40robertforster%2Fnodeterraform)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Node.js wrapper and auto-downloader for HashiCorp Terraform that ensures Terraform is always available on your system without manual installation. This tool automatically detects your operating system and architecture, downloads the appropriate Terraform binary, and provides a seamless command-line interface.

## 🚀 Features

- **Automatic Terraform Installation**: Downloads and installs Terraform automatically if not found
- **Cross-Platform Support**: Works on Windows, macOS, Linux, FreeBSD, OpenBSD, and Solaris
- **Architecture Detection**: Supports x64, x86, ARM64, and ARM architectures
- **Version Management**: Specify exact Terraform versions via environment variables
- **Caching System**: Stores downloaded binaries in `~/.ntf` for reuse
- **Zero Configuration**: Works out of the box with sensible defaults
- **Passthrough Interface**: All Terraform commands and options work exactly as expected
- **Signal Handling**: Proper process management and signal forwarding

## 📦 Installation

### Global Installation (Recommended)

```bash
npm install -g @robertforster/nodeterraform
```

After global installation, you can use the `ntf` command anywhere:

```bash
ntf --version
ntf init
ntf plan
ntf apply
```

### Local Installation

```bash
npm install @robertforster/nodeterraform
```

Then use via npx or npm scripts:

```bash
npx ntf --version
```

## 🎯 Usage

### Basic Usage

The `ntf` command works as a drop-in replacement for `terraform`:

```bash
# Initialize a Terraform configuration
ntf init

# Create an execution plan
ntf plan

# Apply the changes
ntf apply

# Show current state
ntf show

# Destroy infrastructure
ntf destroy
```

### Version Management

Specify a specific Terraform version using the `TERRAFORM_VERSION` environment variable:

```bash
# Use a specific version for a single command
TERRAFORM_VERSION=1.12.0 ntf version

# Set version for your shell session
export TERRAFORM_VERSION=1.12.0
ntf init
ntf plan
```

### Advanced Usage

```bash
# Use with complex Terraform commands
ntf plan -var-file=production.tfvars -out=plan.out

# Works with all Terraform subcommands
ntf workspace list
ntf state list
ntf import aws_instance.example i-1234567890abcdef0

# Environment-specific configurations
TERRAFORM_VERSION=1.13.3 ntf apply -auto-approve
```

## 🔧 How It Works

1. **Binary Resolution**: When you run `ntf`, it first checks for cached Terraform binaries in `~/.ntf/`
2. **System Check**: If no cached version is found, it looks for Terraform in your system PATH
3. **Auto-Download**: If Terraform is not available, it automatically downloads the correct version for your platform
4. **Execution**: Once Terraform is available, all arguments are passed through transparently

### Directory Structure

```
~/.ntf/
├── 1.12.0/
│   └── terraform          # Terraform 1.12.0 binary
├── 1.13.3/
│   └── terraform          # Terraform 1.13.3 binary
└── latest/
    └── terraform          # Latest version binary
```

## 🌐 Supported Platforms

### Operating Systems
- **Windows** (windows)
- **macOS** (darwin)
- **Linux** (linux)
- **FreeBSD** (freebsd)
- **OpenBSD** (openbsd)
- **Solaris/SunOS** (solaris)

### Architectures
- **x64/amd64** - 64-bit Intel/AMD processors
- **x86/386** - 32-bit Intel/AMD processors
- **ARM64/aarch64** - 64-bit ARM processors (Apple Silicon, etc.)
- **ARM** - 32-bit ARM processors

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `TERRAFORM_VERSION` | Specific Terraform version to use | `1.13.3` | `1.12.0` |

### Cache Management

The tool caches downloaded Terraform binaries in `~/.ntf/` to avoid repeated downloads. Each version is stored in its own directory.

To clear the cache:
```bash
rm -rf ~/.ntf
```

To check cache contents:
```bash
ls -la ~/.ntf
```

## 🛠️ Development

### Project Structure

```
nodeterraform/
├── index.js                 # Main entry point and CLI interface
├── terraform-downloader.js  # Terraform download and extraction logic
├── os-detector.js           # Cross-platform OS/architecture detection
├── package.json             # Package configuration
├── LICENSE                  # MIT License
└── README.md               # This file
```

### Key Components

#### `index.js`
- Main CLI entry point
- Binary resolution logic
- Process management and signal handling
- Terraform execution with argument passthrough

#### `terraform-downloader.js`
- Downloads Terraform from HashiCorp releases
- Handles ZIP extraction (with fallback methods)
- Progress indication and error handling
- Caching and file management

#### `os-detector.js`
- Cross-platform OS and architecture detection
- Works in both Node.js and browser environments
- Provides detailed system information

### Building and Testing

```bash
# Install dependencies
npm install

# Test the CLI locally
node index.js --version

# Test the downloader directly
node terraform-downloader.js --version 1.12.0

# Test OS detection
node os-detector.js
```

### API Usage

You can also use the components programmatically:

```javascript
const { downloadTerraform } = require('@robertforster/nodeterraform/terraform-downloader');
const { detectOSAndArch } = require('@robertforster/nodeterraform/os-detector');

// Detect system information
const systemInfo = detectOSAndArch();
console.log(systemInfo);

// Download Terraform programmatically
async function setupTerraform() {
    const terraformPath = await downloadTerraform('1.12.0');
    console.log(`Terraform available at: ${terraformPath}`);
}
```

## 🔍 Troubleshooting

### Common Issues

**Issue**: `Permission denied` when running terraform
```bash
# Solution: The binary might not be executable
chmod +x ~/.ntf/*/terraform
```

**Issue**: Download fails with network errors
```bash
# Solution: Check internet connection and try again
# The tool will retry failed downloads automatically
```

**Issue**: Wrong architecture downloaded
```bash
# Solution: Clear cache and let the tool re-detect
rm -rf ~/.ntf
ntf --version
```

### Debug Information

To see detailed information about what the tool is doing:

```bash
# Check system detection
node -e "console.log(require('./os-detector').detectOSAndArch())"

# Manual download with verbose output
node terraform-downloader.js --version 1.12.0
```

### Getting Help

```bash
# Show Terraform help (passed through)
ntf --help

# Show downloader help
node terraform-downloader.js --help
```

## 📋 Requirements

- **Node.js**: Version 12.0.0 or higher
- **Internet Connection**: Required for initial Terraform download
- **Disk Space**: ~50MB per cached Terraform version

### Optional Dependencies

- **yauzl**: For improved ZIP extraction (automatically used if available)
- **unzip**: System command for ZIP extraction (fallback method)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/nodeterraform.git`
3. Install dependencies: `npm install`
4. Make your changes
5. Test thoroughly on your platform
6. Submit a pull request

### Reporting Issues

Please report issues on the [GitHub Issues page](https://github.com/beamvex/nodeterraform/issues) with:
- Your operating system and architecture
- Node.js version
- Complete error messages
- Steps to reproduce

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [HashiCorp](https://www.hashicorp.com/) for creating Terraform
- The Node.js community for excellent tooling and libraries
- Contributors and users who help improve this tool

## 📚 Related Projects

- [Terraform](https://www.terraform.io/) - Infrastructure as Code tool
- [tfenv](https://github.com/tfutils/tfenv) - Terraform version manager for bash
- [terraform-switcher](https://github.com/warrensbox/terraform-switcher) - Command line tool to switch between Terraform versions

---

**Made with ❤️ by [Robert Forster](https://github.com/beamvex)**
