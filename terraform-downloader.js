#!/usr/bin/env node

/**
 * Terraform Downloader Script
 * Downloads the correct Terraform version based on detected OS and architecture
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { detectOSAndArch } = require('./os-detector');

// Try to require yauzl for zip extraction, fall back to built-in if not available
let yauzl;
try {
    yauzl = require('yauzl');
} catch (e) {
    // Will use built-in unzip method if yauzl is not available
}

// Terraform version to download
const TERRAFORM_VERSION = '1.13.3';

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), '.ntf', TERRAFORM_VERSION);

/**
 * Maps detected OS and architecture to Terraform release naming convention
 */
function mapOSArchToTerraform(detectedOS, detectedArch) {
    let terraformOS = '';
    let terraformArch = '';
    
    // Map OS
    switch (detectedOS.toLowerCase()) {
        case 'windows':
            terraformOS = 'windows';
            break;
        case 'macos':
            terraformOS = 'darwin';
            break;
        case 'linux':
            terraformOS = 'linux';
            break;
        case 'freebsd':
            terraformOS = 'freebsd';
            break;
        case 'openbsd':
            terraformOS = 'openbsd';
            break;
        case 'solaris':
        case 'sunos':
            terraformOS = 'solaris';
            break;
        default:
            throw new Error(`Unsupported operating system: ${detectedOS}`);
    }
    
    // Map architecture
    switch (detectedArch.toLowerCase()) {
        case 'x64':
        case 'x86_64':
            terraformArch = 'amd64';
            break;
        case 'x86':
        case 'ia32':
            terraformArch = '386';
            break;
        case 'arm64':
        case 'aarch64':
            terraformArch = 'arm64';
            break;
        case 'arm':
            terraformArch = 'arm';
            break;
        default:
            throw new Error(`Unsupported architecture: ${detectedArch}`);
    }
    
    return { os: terraformOS, arch: terraformArch };
}

/**
 * Constructs the download URL for Terraform
 */
function buildTerraformURL(version, os, arch) {
    const filename = `terraform_${version}_${os}_${arch}.zip`;
    return `https://releases.hashicorp.com/terraform/${version}/${filename}`;
}

/**
 * Extracts a zip file using Node.js built-in zlib (for simple zip files)
 */
async function extractZipBuiltIn(zipPath, extractDir) {
    const zlib = require('zlib');
    const { execSync } = require('child_process');
    
    try {
        // Use system unzip command if available
        execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });
        console.log(`Extracted using system unzip command`);
        return true;
    } catch (error) {
        console.log('System unzip not available, trying alternative method...');
        throw new Error('Built-in extraction failed. Please install unzip or yauzl package.');
    }
}

/**
 * Extracts a zip file using yauzl library (if available)
 */
function extractZipYauzl(zipPath, extractDir) {
    return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(err);
            
            zipfile.readEntry();
            zipfile.on('entry', (entry) => {
                const outputPath = path.join(extractDir, entry.fileName);
                
                if (/\/$/.test(entry.fileName)) {
                    // Directory entry
                    fs.mkdirSync(outputPath, { recursive: true });
                    zipfile.readEntry();
                } else {
                    // File entry
                    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                    zipfile.openReadStream(entry, (err, readStream) => {
                        if (err) return reject(err);
                        
                        const writeStream = fs.createWriteStream(outputPath);
                        readStream.pipe(writeStream);
                        writeStream.on('close', () => {
                            // Make terraform executable
                            if (entry.fileName === 'terraform') {
                                fs.chmodSync(outputPath, 0o755);
                            }
                            zipfile.readEntry();
                        });
                    });
                }
            });
            
            zipfile.on('end', () => {
                console.log('Extraction completed successfully!');
                resolve();
            });
        });
    });
}

/**
 * Extracts a zip file
 */
async function extractZip(zipPath, extractDir) {
    console.log(`Extracting: ${zipPath}`);
    console.log(`To: ${extractDir}`);
    
    // Create extraction directory if it doesn't exist
    if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
    }
    
    try {
        if (yauzl) {
            await extractZipYauzl(zipPath, extractDir);
        } else {
            await extractZipBuiltIn(zipPath, extractDir);
        }
        
        // Make terraform executable on Unix systems
        const terraformPath = path.join(extractDir, 'terraform');
        if (fs.existsSync(terraformPath) && process.platform !== 'win32') {
            fs.chmodSync(terraformPath, 0o755);
            console.log('Made terraform executable');
        }
        
        return extractDir;
    } catch (error) {
        throw new Error(`Failed to extract zip file: ${error.message}`);
    }
}

/**
 * Downloads a file from URL with progress indication
 */
function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading: ${url}`);
        console.log(`Output: ${outputPath}`);
        
        const file = fs.createWriteStream(outputPath);
        
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Handle redirects
                file.close();
                fs.unlinkSync(outputPath);
                return downloadFile(response.headers.location, outputPath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(outputPath);
                return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize) {
                    const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
                    process.stdout.write(`\rProgress: ${progress}% (${downloadedSize}/${totalSize} bytes)`);
                }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log('\nDownload completed successfully!');
                resolve(outputPath);
            });
            
        }).on('error', (err) => {
            file.close();
            fs.unlinkSync(outputPath);
            reject(err);
        });
    });
}

/**
 * Main function to detect OS/arch and download Terraform
 */
async function downloadTerraform(version = TERRAFORM_VERSION, outputDir = null, extract = true) {
    // Default to user's home directory if no output directory specified
    if (!outputDir) {
        outputDir = DEFAULT_OUTPUT_DIR;
    }
    try {
        console.log('=== Terraform Downloader ===');
        
        // Detect current OS and architecture
        const systemInfo = detectOSAndArch();
        console.log(`Detected OS: ${systemInfo.os}`);
        console.log(`Detected Architecture: ${systemInfo.arch}`);
        console.log(`Environment: ${systemInfo.environment}`);
        
        // Map to Terraform naming convention
        const terraformPlatform = mapOSArchToTerraform(systemInfo.os, systemInfo.arch);
        console.log(`Terraform Platform: ${terraformPlatform.os}_${terraformPlatform.arch}`);
        
        // Build download URL
        const downloadURL = buildTerraformURL(version, terraformPlatform.os, terraformPlatform.arch);
        
        // Prepare output path
        const filename = `terraform_${version}_${terraformPlatform.os}_${terraformPlatform.arch}.zip`;
        const outputPath = path.join(outputDir, filename);
        
        // Check if terraform binary already exists (skip download if extracted version exists)
        const terraformBinaryPath = path.join(outputDir, 'terraform');
        if (fs.existsSync(terraformBinaryPath) && !extract) {
            console.log(`Terraform binary already exists: ${terraformBinaryPath}`);
            return terraformBinaryPath;
        }
        
        // Check if zip file already exists
        if (fs.existsSync(outputPath)) {
            console.log(`Zip file already exists: ${outputPath}`);
            const stats = fs.statSync(outputPath);
            console.log(`File size: ${stats.size} bytes`);
            
            if (!extract) {
                console.log('Use --force to overwrite or delete the file manually.');
                return outputPath;
            }
        } else {
            // Create output directory if it doesn't exist
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Download the file
            await downloadFile(downloadURL, outputPath);
            
            // Verify download
            const stats = fs.statSync(outputPath);
            console.log(`\nDownload Summary:`);
            console.log(`- File: ${filename}`);
            console.log(`- Size: ${stats.size} bytes`);
            console.log(`- Location: ${outputPath}`);
        }
        
        // Extract the zip file if requested
        if (extract) {
            const extractDir = outputDir;
            await extractZip(outputPath, extractDir);
            
            const terraformPath = path.join(extractDir, 'terraform');
            if (fs.existsSync(terraformPath)) {
                console.log(`\nExtraction Summary:`);
                console.log(`- Terraform binary: ${terraformPath}`);
                console.log(`- Ready to use!`);
                
                // Optionally remove the zip file after successful extraction
                try {
                    fs.unlinkSync(outputPath);
                    console.log(`- Cleaned up zip file: ${filename}`);
                } catch (err) {
                    console.log(`- Warning: Could not remove zip file: ${err.message}`);
                }
                
                return terraformPath;
            } else {
                throw new Error('Terraform binary not found after extraction');
            }
        }
        
        return outputPath;
        
    } catch (error) {
        console.error('Error downloading Terraform:', error.message);
        process.exit(1);
    }
}

/**
 * Command line interface
 */
function parseArguments() {
    const args = process.argv.slice(2);
    const options = {
        version: TERRAFORM_VERSION,
        outputDir: null, // Will default to ~/.terraform
        force: false,
        help: false,
        noExtract: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--version':
            case '-v':
                options.version = args[++i];
                break;
            case '--output':
            case '-o':
                options.outputDir = args[++i];
                break;
            case '--force':
            case '-f':
                options.force = true;
                break;
            case '--no-extract':
                options.noExtract = true;
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
            default:
                console.error(`Unknown option: ${arg}`);
                options.help = true;
        }
    }
    
    return options;
}

/**
 * Display help information
 */
function showHelp() {
    console.log(`
Terraform Downloader

Usage: node terraform-downloader.js [options]

Options:
  -v, --version <version>    Terraform version to download (default: ${TERRAFORM_VERSION})
  -o, --output <directory>   Output directory (default: ~/.ntf)
  -f, --force               Overwrite existing files
  --no-extract              Download only, don't extract the zip file
  -h, --help                Show this help message

Examples:
  node terraform-downloader.js                           # Download and extract to ~/.ntf
  node terraform-downloader.js --version 1.12.0         # Download specific version
  node terraform-downloader.js --output ./downloads     # Download to custom directory
  node terraform-downloader.js --no-extract             # Download zip only, don't extract
`);
}

// Export functions for use as module
module.exports = {
    downloadTerraform,
    mapOSArchToTerraform,
    buildTerraformURL
};

// Run if executed directly
if (require.main === module) {
    const options = parseArguments();
    
    if (options.help) {
        showHelp();
        process.exit(0);
    }
    
    // Handle force option by removing existing files
    if (options.force) {
        const systemInfo = detectOSAndArch();
        const terraformPlatform = mapOSArchToTerraform(systemInfo.os, systemInfo.arch);
        const filename = `terraform_${options.version}_${terraformPlatform.os}_${terraformPlatform.arch}.zip`;
        outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
        const filePath = path.join(outputDir, filename);
        const binaryPath = path.join(outputDir, 'terraform');
        
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`Removed existing zip file: ${filePath}`);
        }
        
        if (fs.existsSync(binaryPath)) {
            fs.unlinkSync(binaryPath);
            console.log(`Removed existing binary: ${binaryPath}`);
        }
    }
    
    downloadTerraform(options.version, options.outputDir, !options.noExtract);
}
