#!/usr/bin/env node

/**
 * get-latest-terraform-version.js
 * Fetches the latest Terraform version using GitHub's public API and prints it to stdout.
 *
 * - Default endpoint: https://api.github.com/repos/hashicorp/terraform/releases/latest
 * - Falls back to tags endpoint if needed.
 * - Supports optional GITHUB_TOKEN to increase rate limits.
 */

const https = require('https');

const GITHUB_API_RELEASE_LATEST = 'https://api.github.com/repos/hashicorp/terraform/releases/latest';
const GITHUB_API_TAGS_LATEST = 'https://api.github.com/repos/hashicorp/terraform/tags?per_page=1';

function requestJson(url) {
  const headers = {
    'User-Agent': 'nodeterraform/latest-version-script',
    'Accept': 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const { statusCode } = res;
      const loc = res.headers.location;

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(statusCode) && loc) {
        res.resume(); // discard
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
          // Try to extract helpful error info
          let message = `HTTP ${statusCode} from ${url}`;
          try {
            const body = JSON.parse(data);
            if (body && (body.message || body.error)) {
              message += ` - ${body.message || body.error}`;
            }
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
  // Terraform GitHub releases typically use a leading 'v'
  return v.replace(/^v/i, '');
}

async function getLatestVersion() {
  // 1) Try releases/latest
  try {
    const release = await requestJson(GITHUB_API_RELEASE_LATEST);
    // Prefer tag_name; fallback to name
    const version = normalizeVersion(release.tag_name || release.name);
    if (!version) throw new Error('No version found on releases/latest payload');
    return version;
  } catch (e) {
    // 2) Fallback to the tags endpoint
    const tags = await requestJson(GITHUB_API_TAGS_LATEST);
    if (Array.isArray(tags) && tags.length > 0) {
      const version = normalizeVersion(tags[0].name);
      if (version) return version;
    }
    throw e; // rethrow original error if fallback fails
  }
}

(async () => {
  try {
    const version = await getLatestVersion();
    process.stdout.write(`${version}\n`);
  } catch (err) {
    console.error(`Failed to fetch latest Terraform version: ${err.message}`);
    process.exit(1);
  }
})();
