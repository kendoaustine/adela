// JWT Verification Module for Nginx
// This module provides JWT token verification functionality for Nginx

import crypto from 'crypto';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_ALGORITHM = 'HS256';

/**
 * Base64 URL decode
 */
function base64UrlDecode(str) {
    // Add padding if needed
    str += new Array(5 - str.length % 4).join('=');
    // Replace URL-safe characters
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    // Decode base64
    return Buffer.from(str, 'base64').toString();
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Create HMAC signature
 */
function createSignature(data, secret) {
    return crypto
        .createHmac('sha256', secret)
        .update(data)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Parse JWT token
 */
function parseToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }

        const header = JSON.parse(base64UrlDecode(parts[0]));
        const payload = JSON.parse(base64UrlDecode(parts[1]));
        const signature = parts[2];

        return {
            header,
            payload,
            signature,
            raw: {
                header: parts[0],
                payload: parts[1],
                signature: parts[2]
            }
        };
    } catch (error) {
        return null;
    }
}

/**
 * Verify JWT token signature
 */
function verifySignature(token, secret) {
    const parsed = parseToken(token);
    if (!parsed) {
        return false;
    }

    const data = `${parsed.raw.header}.${parsed.raw.payload}`;
    const expectedSignature = createSignature(data, secret);
    
    return parsed.signature === expectedSignature;
}

/**
 * Check if token is expired
 */
function isTokenExpired(payload) {
    if (!payload.exp) {
        return false; // No expiration set
    }
    
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now;
}

/**
 * Check if token is not yet valid
 */
function isTokenNotYetValid(payload) {
    if (!payload.nbf) {
        return false; // No "not before" set
    }
    
    const now = Math.floor(Date.now() / 1000);
    return payload.nbf > now;
}

/**
 * Verify JWT token
 */
function verify(r) {
    try {
        // Get token from Authorization header
        const authHeader = r.headersIn['Authorization'] || r.headersIn['authorization'];
        if (!authHeader) {
            return '0'; // No token provided
        }

        // Extract Bearer token
        const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
        if (!tokenMatch) {
            return '0'; // Invalid format
        }

        const token = tokenMatch[1];
        
        // Parse token
        const parsed = parseToken(token);
        if (!parsed) {
            return '0'; // Invalid token format
        }

        // Check algorithm
        if (parsed.header.alg !== JWT_ALGORITHM) {
            return '0'; // Unsupported algorithm
        }

        // Verify signature
        if (!verifySignature(token, JWT_SECRET)) {
            return '0'; // Invalid signature
        }

        // Check expiration
        if (isTokenExpired(parsed.payload)) {
            return '0'; // Token expired
        }

        // Check not before
        if (isTokenNotYetValid(parsed.payload)) {
            return '0'; // Token not yet valid
        }

        // Store payload in request variables for later use
        r.variables.jwt_payload = JSON.stringify(parsed.payload);
        
        return '1'; // Valid token
    } catch (error) {
        r.error(`JWT verification error: ${error.message}`);
        return '0';
    }
}

/**
 * Get user ID from JWT token
 */
function getUserId(r) {
    try {
        const payload = r.variables.jwt_payload;
        if (!payload) {
            return '';
        }
        
        const parsed = JSON.parse(payload);
        return parsed.sub || parsed.userId || '';
    } catch (error) {
        return '';
    }
}

/**
 * Get user role from JWT token
 */
function getUserRole(r) {
    try {
        const payload = r.variables.jwt_payload;
        if (!payload) {
            return '';
        }
        
        const parsed = JSON.parse(payload);
        return parsed.role || '';
    } catch (error) {
        return '';
    }
}

/**
 * Get user email from JWT token
 */
function getUserEmail(r) {
    try {
        const payload = r.variables.jwt_payload;
        if (!payload) {
            return '';
        }
        
        const parsed = JSON.parse(payload);
        return parsed.email || '';
    } catch (error) {
        return '';
    }
}

/**
 * Check if user has specific role
 */
function hasRole(r) {
    try {
        const requiredRole = r.args.role;
        if (!requiredRole) {
            return '0';
        }
        
        const userRole = getUserRole(r);
        return userRole === requiredRole ? '1' : '0';
    } catch (error) {
        return '0';
    }
}

/**
 * Check if user has any of the specified roles
 */
function hasAnyRole(r) {
    try {
        const requiredRoles = r.args.roles;
        if (!requiredRoles) {
            return '0';
        }
        
        const roles = requiredRoles.split(',');
        const userRole = getUserRole(r);
        
        return roles.includes(userRole) ? '1' : '0';
    } catch (error) {
        return '0';
    }
}

/**
 * Get token expiration time
 */
function getTokenExpiration(r) {
    try {
        const payload = r.variables.jwt_payload;
        if (!payload) {
            return '';
        }
        
        const parsed = JSON.parse(payload);
        return parsed.exp ? parsed.exp.toString() : '';
    } catch (error) {
        return '';
    }
}

/**
 * Check if token will expire soon (within specified minutes)
 */
function willExpireSoon(r) {
    try {
        const minutes = parseInt(r.args.minutes) || 5; // Default 5 minutes
        const payload = r.variables.jwt_payload;
        if (!payload) {
            return '0';
        }
        
        const parsed = JSON.parse(payload);
        if (!parsed.exp) {
            return '0'; // No expiration
        }
        
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = parsed.exp - now;
        const warningThreshold = minutes * 60;
        
        return expiresIn <= warningThreshold ? '1' : '0';
    } catch (error) {
        return '0';
    }
}

// Export functions for Nginx
export default {
    verify,
    getUserId,
    getUserRole,
    getUserEmail,
    hasRole,
    hasAnyRole,
    getTokenExpiration,
    willExpireSoon
};
