#!/usr/bin/env node

/**
 * Index script: ensures Terraform is available, downloads if needed, then runs it
 * and passes through all command line options.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

const { downloadTerraform } = require('./terraform-downloader');

// Simple semver compare: returns 1 if a>b, -1 if a<b, 0 if equal
function compareSemver(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function findCachedTerraform(desiredVersion) {
  
  const baseDir = path.join(os.homedir(), '.ntf');
  try {
    if (!fs.existsSync(baseDir)) return null;

    if (desiredVersion) {
      const candidate = path.join(baseDir, desiredVersion, 'terraform');
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  } catch (_) {
    return null;
  }
}

// Cache config for latest version lookup
const LATEST_CACHE_DIR = path.join(os.homedir(), '.ntf');
const LATEST_CACHE_FILE = path.join(LATEST_CACHE_DIR, 'latest-version.json');
const ONE_HOUR_MS = 60 * 60 * 1000;

function readLatestCache() {
  try {
    if (!fs.existsSync(LATEST_CACHE_FILE)) return null;
    const stat = fs.statSync(LATEST_CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;
    const raw = fs.readFileSync(LATEST_CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return { data, fresh: age < ONE_HOUR_MS };
  } catch (_) {
    return null;
  }
}

function writeLatestCache(version) {
  try {
    if (!fs.existsSync(LATEST_CACHE_DIR)) fs.mkdirSync(LATEST_CACHE_DIR, { recursive: true });
    const payload = { version, fetchedAt: new Date().toISOString() };
    fs.writeFileSync(LATEST_CACHE_FILE, JSON.stringify(payload, null, 2));
  } catch (_) {}
}

function requestJson(url) {
  const headers = {
    'User-Agent': 'nodeterraform/index-latest-check',
    'Accept': 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const { statusCode } = res;
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(statusCode) && loc) {
        res.resume();
        return resolve(requestJson(loc));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (statusCode && statusCode >= 200 && statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        } else {
          let message = `HTTP ${statusCode} from ${url}`;
          try {
            const body = JSON.parse(data);
            if (body && (body.message || body.error)) message += ` - ${body.message || body.error}`;
          } catch (_) {}
          reject(new Error(message));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

function normalizeVersion(v) {
  if (!v) return null;
  return String(v).replace(/^v/i, '');
}

async function getLatestTerraformVersionCached() {
  // Check cache first
  const cached = readLatestCache();
  if (cached && cached.data && cached.data.version && cached.fresh) {
    return cached.data.version;
  }

  // Fetch latest via GitHub API
  const RELEASE_LATEST = 'https://api.github.com/repos/hashicorp/terraform/releases/latest';
  const TAGS_LATEST = 'https://api.github.com/repos/hashicorp/terraform/tags?per_page=1';
  let version;
  try {
    const release = await requestJson(RELEASE_LATEST);
    version = normalizeVersion(release.tag_name || release.name);
  } catch (e) {
    // Fallback to tags
    const tags = await requestJson(TAGS_LATEST);
    if (Array.isArray(tags) && tags.length > 0) {
      version = normalizeVersion(tags[0].name);
    } else {
      throw e;
    }
  }

  if (!version) throw new Error('Could not determine latest Terraform version');
  writeLatestCache(version);
  return version;
}

async function ensureTerraform() {
  // 1) Prefer cached terraform in ~/.ntf first (desired version or highest available)
  let desiredVersion = process.env.TERRAFORM_VERSION || undefined;
  if (!desiredVersion) {
    try {
      desiredVersion = await getLatestTerraformVersionCached();
    } catch (e) {
      // If latest lookup fails, proceed without a version to use system or downloader default
      desiredVersion = undefined;
    }
  }
  const cached = findCachedTerraform(desiredVersion);
  if (cached) {
    return cached;
  }

  // 2) Fall back to system terraform if available
  try {
    const check = spawnSync('terraform', ['version'], { stdio: 'ignore' });
    if (check.status === 0) {
      return 'terraform';
    }
  } catch (_) {
    // not on PATH
  }

  // 3) Finally, download/ensure cached terraform
  const version = desiredVersion || process.env.TERRAFORM_VERSION || undefined; // prefer resolved latest
  const binPath = await downloadTerraform(version);

  // Make sure it's executable on unix-like systems
  if (process.platform !== 'win32' && fs.existsSync(binPath)) {
    try { fs.chmodSync(binPath, 0o755); } catch (_) {}
  }

  return binPath;
}

async function main() {
  const args = process.argv.slice(2);

  let terraformPath;
  try {
    terraformPath = await ensureTerraform();
  } catch (err) {
    console.error('Failed to ensure Terraform is available:', err.message || err);
    process.exit(1);
  }

  // Spawn Terraform with passthrough args
  const child = spawn(terraformPath, args, {
    stdio: 'inherit',
    env: process.env,
  });

  // Forward termination signals to child
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  signals.forEach((sig) => {
    process.on(sig, () => {
      if (!child.killed) {
        try { child.kill(sig); } catch (_) {}
      }
    });
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      // If killed by a signal, exit with non-zero code
      process.kill(process.pid, signal);
    } else {
      process.exit(code == null ? 1 : code);
    }
  });

  child.on('error', (err) => {
    console.error('Error running Terraform:', err.message || err);
    process.exit(1);
  });
}

main();
