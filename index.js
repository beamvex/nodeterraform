#!/usr/bin/env node

/**
 * Index script: ensures Terraform is available, downloads if needed, then runs it
 * and passes through all command line options.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

    // Find highest available version that contains a terraform binary
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => /\d+\.\d+\.\d+/.test(name));

    let best = null;
    for (const ver of entries) {
      const candidate = path.join(baseDir, ver, 'terraform');
      if (fs.existsSync(candidate)) {
        if (!best || compareSemver(ver, best.ver) > 0) {
          best = { ver, path: candidate };
        }
      }
    }

    return best ? best.path : null;
  } catch (_) {
    return null;
  }
}

async function ensureTerraform() {
  // 1) Prefer cached terraform in ~/.ntf first (desired version or highest available)
  const desiredVersion = process.env.TERRAFORM_VERSION || undefined;
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
  const version = process.env.TERRAFORM_VERSION || undefined; // let downloader use its default if undefined
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
