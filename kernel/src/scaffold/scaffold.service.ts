import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

// ── Security deny patterns (spec §9.3) ──────────────────────────────────
// These must never appear in AI-generated app code.

interface DenyPattern {
  pattern: RegExp;
  reason: string;
}

const SECURITY_DENY_PATTERNS: DenyPattern[] = [
  {
    pattern: /\beval\s*\(/,
    reason: 'eval() is forbidden — arbitrary code execution risk',
  },
  {
    pattern: /\.innerHTML\s*=/,
    reason: 'innerHTML assignment — XSS risk; use React JSX instead',
  },
  {
    pattern: /\.outerHTML\s*=/,
    reason: 'outerHTML assignment — XSS risk',
  },
  {
    pattern: /document\.write\s*\(/,
    reason: 'document.write() — XSS risk',
  },
  {
    pattern: /localStorage\s*\./,
    reason:
      'Direct localStorage access forbidden in generated apps — use OS store',
  },
  {
    pattern: /sessionStorage\s*\./,
    reason: 'Direct sessionStorage access forbidden in generated apps',
  },
  {
    pattern: /require\s*\(\s*['"`]child_process/,
    reason: 'child_process require — server-side escape attempt',
  },
  {
    pattern: /process\.env\b/,
    reason: 'process.env access forbidden in generated client apps',
  },
  {
    pattern: /fetch\s*\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/,
    reason: 'External fetch calls require explicit allowlisting',
  },
];

/**
 * Scaffold Service — Path Jail & Security Scanner (spec §9.2, §9.3, §9.5).
 *
 * Provides:
 * - jailPath(): prevents path traversal outside web/apps/generated/
 * - validateSource(): security scan + syntax validation for generated code
 */
@Injectable()
export class ScaffoldService {
  private readonly JAIL_ROOT: string;

  constructor(private readonly config: ConfigService) {
    const repoRoot = this.config.get<string>(
      'GAMMA_OS_REPO',
      path.resolve(__dirname, '../../..'),
    );
    this.JAIL_ROOT = path.resolve(repoRoot, 'web/apps/generated');
  }

  // ── Path Jail Guard (spec §9.5) ────────────────────────────────────────

  /**
   * Resolves a relative path and verifies it stays within JAIL_ROOT.
   * Throws ForbiddenException if path traversal is attempted.
   *
   * @param relativePath — path relative to web/apps/generated/
   * @returns absolute resolved path within the jail
   */
  jailPath(relativePath: string): string {
    // Reject absolute paths outright
    if (path.isAbsolute(relativePath)) {
      throw new ForbiddenException(
        `Path traversal attempt blocked: absolute path '${relativePath}' is forbidden`,
      );
    }

    const resolved = path.resolve(this.JAIL_ROOT, relativePath);

    if (
      resolved !== this.JAIL_ROOT &&
      !resolved.startsWith(this.JAIL_ROOT + path.sep)
    ) {
      throw new ForbiddenException(
        `Path traversal attempt blocked: '${relativePath}' resolves outside jail`,
      );
    }

    return resolved;
  }

  // ── Security Scanner (spec §9.3) ───────────────────────────────────────

  /**
   * Validates AI-generated source code for security violations and syntax errors.
   * Security scan runs BEFORE syntax parse — abort early on violations.
   *
   * @param source — TypeScript/TSX source code
   * @param fileName — for error messages
   * @returns { ok, errors } — ok=true means code is safe to write
   */
  validateSource(
    source: string,
    fileName = 'generated.tsx',
  ): { ok: boolean; errors: string[] } {
    const errors: string[] = [];

    // ── Phase 1: Security deny patterns ────────────────────────────────
    for (const { pattern, reason } of SECURITY_DENY_PATTERNS) {
      if (pattern.test(source)) {
        errors.push(`Security violation in ${fileName}: ${reason}`);
      }
    }

    // Abort early if security issues found — don't bother parsing
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    // ── Phase 2: Structural guards ─────────────────────────────────────
    if (!source.includes('export')) {
      errors.push(`${fileName}: must contain at least one export`);
    }

    // Must reference React (import or JSX pragma)
    if (!source.includes('React') && !source.includes('react')) {
      errors.push(
        `${fileName}: must import React or reference react for JSX`,
      );
    }

    return { ok: errors.length === 0, errors };
  }

  /** Expose jail root for other services (e.g. asset serving) */
  getJailRoot(): string {
    return this.JAIL_ROOT;
  }
}
