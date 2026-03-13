import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ── Types ─────────────────────────────────────────────────────────────────

export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  mtime: number;
  ext: string;
}

export interface ListResult {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export interface ReadResult {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
}

// ── Security Guard ────────────────────────────────────────────────────────

/** Allowed root paths for browsing (safety boundary). */
const ALLOWED_ROOTS = [
  os.homedir(),
  '/tmp',
  '/var/folders',
  '/Users',
];

function assertAllowed(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  const allowed = ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!allowed) {
    throw new ForbiddenException(
      `Access denied: path outside allowed roots. Allowed: ${ALLOWED_ROOTS.join(', ')}`,
    );
  }
}

function resolveSafe(p: string): string {
  if (!p || typeof p !== 'string') throw new BadRequestException('Path is required');
  const resolved = path.resolve(p);
  assertAllowed(resolved);
  return resolved;
}

// ── Controller ────────────────────────────────────────────────────────────

@Controller('api/fs')
export class FilesystemController {
  /** GET /api/fs/list?path=/some/dir&showHidden=true  */
  @Get('list')
  async list(
    @Query('path') queryPath?: string,
    @Query('showHidden') showHidden?: string,
  ): Promise<ListResult> {
    const includeHidden = showHidden === 'true' || showHidden === '1';
    const target = resolveSafe(queryPath ?? os.homedir());

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(target);
    } catch {
      throw new BadRequestException(`Cannot access path: ${target}`);
    }

    if (!stat.isDirectory()) {
      throw new BadRequestException(`Not a directory: ${target}`);
    }

    let names: string[];
    try {
      names = await fs.readdir(target);
    } catch {
      throw new InternalServerErrorException(`Cannot read directory: ${target}`);
    }

    const entries: FsEntry[] = [];
    for (const name of names) {
      if (!includeHidden && name.startsWith('.')) continue;
      const full = path.join(target, name);
      try {
        const s = await fs.lstat(full);
        let type: FsEntry['type'] = 'other';
        if (s.isDirectory()) type = 'directory';
        else if (s.isFile()) type = 'file';
        else if (s.isSymbolicLink()) type = 'symlink';

        entries.push({
          name,
          path: full,
          type,
          size: s.size,
          mtime: s.mtimeMs,
          ext: type === 'file' ? path.extname(name).toLowerCase() : '',
        });
      } catch {
        // Skip inaccessible entries
      }
    }

    // Dirs first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });

    const parent = target !== path.parse(target).root
      ? path.dirname(target)
      : null;

    return { path: target, parent, entries };
  }

  /** GET /api/fs/read?path=/file.txt  */
  @Get('read')
  async read(@Query('path') queryPath?: string): Promise<ReadResult> {
    const target = resolveSafe(queryPath ?? '');

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(target);
    } catch {
      throw new BadRequestException(`Cannot access: ${target}`);
    }
    if (!stat.isFile()) throw new BadRequestException(`Not a file: ${target}`);

    const MAX_BYTES = 512 * 1024; // 512 KB cap for viewer
    let content: string;
    let truncated = false;

    try {
      const buf = await fs.readFile(target);
      if (buf.length > MAX_BYTES) {
        content = buf.subarray(0, MAX_BYTES).toString('utf8');
        truncated = true;
      } else {
        content = buf.toString('utf8');
      }
    } catch {
      throw new InternalServerErrorException(`Cannot read file: ${target}`);
    }

    return { path: target, content, size: stat.size, truncated };
  }

  /** POST /api/fs/mkdir  { path: '/some/new/dir' } */
  @Post('mkdir')
  async mkdir(@Body('path') dirPath?: string): Promise<{ ok: boolean; path: string }> {
    const target = resolveSafe(dirPath ?? '');
    try {
      await fs.mkdir(target, { recursive: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(`mkdir failed: ${msg}`);
    }
    return { ok: true, path: target };
  }

  /** POST /api/fs/copy  { src: '/a', dest: '/b' } */
  @Post('copy')
  async copy(
    @Body('src') src?: string,
    @Body('dest') dest?: string,
  ): Promise<{ ok: boolean }> {
    const resolvedSrc = resolveSafe(src ?? '');
    const resolvedDest = resolveSafe(dest ?? '');

    try {
      const s = await fs.stat(resolvedSrc);
      if (s.isDirectory()) {
        await copyDir(resolvedSrc, resolvedDest);
      } else {
        await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
        await fs.copyFile(resolvedSrc, resolvedDest);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(`copy failed: ${msg}`);
    }
    return { ok: true };
  }

  /** DELETE /api/fs/delete?path=/some/file  */
  @Delete('delete')
  async delete(@Query('path') queryPath?: string): Promise<{ ok: boolean }> {
    const target = resolveSafe(queryPath ?? '');
    try {
      await fs.rm(target, { recursive: true, force: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(`delete failed: ${msg}`);
    }
    return { ok: true };
  }

  /** POST /api/fs/rename  { src: '/old', dest: '/new' } */
  @Post('rename')
  async rename(
    @Body('src') src?: string,
    @Body('dest') dest?: string,
  ): Promise<{ ok: boolean }> {
    const resolvedSrc = resolveSafe(src ?? '');
    const resolvedDest = resolveSafe(dest ?? '');
    try {
      await fs.rename(resolvedSrc, resolvedDest);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(`rename failed: ${msg}`);
    }
    return { ok: true };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
