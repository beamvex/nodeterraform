/**
 * OS and Architecture Detection Script
 * Works in both Node.js and browser environments
 */

function detectOSAndArch() {
    let os = 'unknown';
    let arch = 'unknown';
    let environment = 'unknown';

    // Check if running in Node.js environment
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        environment = 'node';
        
        // Use Node.js built-in modules
        const osModule = require('os');
        
        // Get OS information
        const platform = osModule.platform();
        switch (platform) {
            case 'win32':
                os = 'Windows';
                break;
            case 'darwin':
                os = 'macOS';
                break;
            case 'linux':
                os = 'Linux';
                break;
            case 'freebsd':
                os = 'FreeBSD';
                break;
            case 'openbsd':
                os = 'OpenBSD';
                break;
            case 'sunos':
                os = 'SunOS';
                break;
            case 'aix':
                os = 'AIX';
                break;
            default:
                os = platform;
        }
        
        // Get architecture information
        arch = osModule.arch();
        
    } else if (typeof navigator !== 'undefined') {
        environment = 'browser';
        
        // Browser environment - use navigator object
        const userAgent = navigator.userAgent;
        const platform = navigator.platform;
        
        // Detect OS from user agent and platform
        if (userAgent.includes('Windows') || platform.includes('Win')) {
            os = 'Windows';
        } else if (userAgent.includes('Mac') || platform.includes('Mac')) {
            os = 'macOS';
        } else if (userAgent.includes('Linux') || platform.includes('Linux')) {
            os = 'Linux';
        } else if (userAgent.includes('Android')) {
            os = 'Android';
        } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
            os = 'iOS';
        } else if (userAgent.includes('FreeBSD')) {
            os = 'FreeBSD';
        }
        
        // Detect architecture (limited in browser)
        if (platform.includes('x86_64') || platform.includes('Win64') || userAgent.includes('x64')) {
            arch = 'x64';
        } else if (platform.includes('i386') || platform.includes('i686') || userAgent.includes('x86')) {
            arch = 'x86';
        } else if (userAgent.includes('ARM') || userAgent.includes('arm')) {
            arch = 'arm';
        } else if (userAgent.includes('aarch64') || userAgent.includes('arm64')) {
            arch = 'arm64';
        }
        
        // Additional checks for modern browsers
        if ('userAgentData' in navigator && navigator.userAgentData) {
            const uaData = navigator.userAgentData;
            if (uaData.platform) {
                if (uaData.platform.toLowerCase().includes('windows')) {
                    os = 'Windows';
                } else if (uaData.platform.toLowerCase().includes('macos')) {
                    os = 'macOS';
                } else if (uaData.platform.toLowerCase().includes('linux')) {
                    os = 'Linux';
                }
            }
        }
    }
    
    return {
        os,
        arch,
        environment,
        details: {
            raw: {
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
                platform: typeof navigator !== 'undefined' ? navigator.platform : null,
                nodeVersion: typeof process !== 'undefined' ? process.version : null,
                nodePlatform: typeof process !== 'undefined' ? process.platform : null,
                nodeArch: typeof process !== 'undefined' ? process.arch : null
            }
        }
    };
}

// Function to display results in a formatted way
function displayOSInfo() {
    const info = detectOSAndArch();
    
    console.log('=== OS and Architecture Detection ===');
    console.log(`Environment: ${info.environment}`);
    console.log(`Operating System: ${info.os}`);
    console.log(`Architecture: ${info.arch}`);
    console.log('\n=== Raw Details ===');
    
    if (info.environment === 'node') {
        console.log(`Node.js Version: ${info.details.raw.nodeVersion}`);
        console.log(`Node.js Platform: ${info.details.raw.nodePlatform}`);
        console.log(`Node.js Architecture: ${info.details.raw.nodeArch}`);
    } else if (info.environment === 'browser') {
        console.log(`User Agent: ${info.details.raw.userAgent}`);
        console.log(`Platform: ${info.details.raw.platform}`);
    }
    
    return info;
}

// Export for Node.js or make available globally for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        detectOSAndArch,
        displayOSInfo
    };
} else {
    // Browser environment - attach to window object
    window.detectOSAndArch = detectOSAndArch;
    window.displayOSInfo = displayOSInfo;
}

// Auto-run if this script is executed directly
if (typeof require !== 'undefined' && require.main === module) {
    displayOSInfo();
}
