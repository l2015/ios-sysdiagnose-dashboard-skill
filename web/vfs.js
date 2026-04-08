/**
 * Virtual File System — from in-memory tar contents
 * Provides a subset of Node.js fs API: readFileSync, existsSync, readdirSync
 */
class VFS {
  constructor() {
    /** @type {Map<string, Uint8Array|string>} */
    this.files = new Map();
    /** @type {Set<string>} */
    this.dirs = new Set();
  }

  /** Add a file to the VFS */
  addFile(path, data) {
    const normalized = path.replace(/\/+/g, '/').replace(/^\//, '');
    this.files.set(normalized, data);
    // Track parent directories
    const parts = normalized.split('/');
    for (let i = 1; i < parts.length; i++) {
      this.dirs.add(parts.slice(0, i).join('/'));
    }
  }

  /** Read file as Uint8Array */
  readFileSync(path) {
    const normalized = path.replace(/\/+/g, '/').replace(/^\//, '');
    return this.files.get(normalized);
  }

  /** Read file as UTF-8 string */
  readTextSync(path) {
    const data = this.readFileSync(path);
    if (!data) return null;
    return new TextDecoder('utf-8').decode(data);
  }

  /** Check if file or directory exists */
  existsSync(path) {
    const normalized = path.replace(/\/+/g, '/').replace(/^\//, '');
    return this.files.has(normalized) || this.dirs.has(normalized);
  }

  /** List directory contents (file and dir names, not full paths) */
  readdirSync(path) {
    const normalized = path.replace(/\/+/g, '/').replace(/\/$/, '').replace(/^\//, '');
    const prefix = normalized ? normalized + '/' : '';
    const names = new Set();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const name = rest.split('/')[0];
        if (name) names.add(name);
      }
    }
    for (const dir of this.dirs) {
      if (dir.startsWith(prefix)) {
        const rest = dir.slice(prefix.length);
        const name = rest.split('/')[0];
        if (name) names.add(name);
      }
    }
    return [...names].sort();
  }

  /** Find first file matching a glob-like pattern (simple * wildcard) */
  findFirst(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.files.keys()) {
      if (regex.test(key)) return key;
    }
    return null;
  }
}

/**
 * Parse a tar archive from a Uint8Array into a VFS
 */
function parseTar(buffer, vfs) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;
  // MUST be outside the while loop — 'let' inside the loop creates a new binding each
  // iteration, so a type 'L' entry that sets longName then continues would lose the value
  // on the next iteration. Moving it outside lets the long name persist to the next entry.
  let longName = null;

  while (offset < buffer.length - 512) {
    // Check for end of archive (two zero blocks)
    if (buffer[offset] === 0 && buffer[offset + 1] === 0) break;

    // Read header
    const nameBytes = buffer.subarray(offset, offset + 100);
    let name = '';
    for (let i = 0; i < 100 && nameBytes[i] !== 0; i++) {
      name += String.fromCharCode(nameBytes[i]);
    }
    if (!name) break;

    // Read size — support both octal (POSIX) and binary (BSD tar) encoding
    const typeFlag = String.fromCharCode(buffer[offset + 156]);
    function readEntrySize() {
      const firstByte = buffer[offset + 124];
      // Binary size: high bit set (used by BSD tar for large files)
      if (firstByte & 0x80) {
        let size = 0;
        for (let i = 124; i < 136; i++) { size = (size << 8) | buffer[offset + i]; }
        return size;
      }
      // Octal size (standard POSIX)
      const octal = new TextDecoder().decode(buffer.subarray(offset + 124, offset + 136)).trim();
      return parseInt(octal, 8) || 0;
    }

    if (typeFlag === 'L') {
      // GNU long name entry — the data block contains the full name
      const size = readEntrySize();
      const dataSize = Math.ceil(size / 512) * 512;
      const nameData = buffer.subarray(offset + 512, offset + 512 + size);
      longName = new TextDecoder().decode(nameData).replace(/\0/g, '');
      offset += 512 + dataSize;
      continue;
    }

    // Check for POSIX extended header (type 'x' or 'g')
    if (typeFlag === 'x' || typeFlag === 'g') {
      const size = readEntrySize();
      const dataSize = Math.ceil(size / 512) * 512;

      // Parse extended header for path
      const headerData = new TextDecoder().decode(buffer.subarray(offset + 512, offset + 512 + size));
      const pathMatch = headerData.match(/\d+ path=(.+)/);
      if (pathMatch) longName = pathMatch[1].trim();

      offset += 512 + dataSize;
      continue;
    }

    // Read size for regular entries
    const size = readEntrySize();
    const dataSize = Math.ceil(size / 512) * 512;

    // Use long name if available, then reset for next entry
    const finalName = longName || name;
    longName = null;

    // Regular file (type '0' or '\0')
    if ((typeFlag === '0' || typeFlag === '\0' || typeFlag === ' ') && size > 0) {
      const fileData = buffer.subarray(offset + 512, offset + 512 + size);
      vfs.addFile(finalName, new Uint8Array(fileData));
    } else if (typeFlag === '5' || finalName.endsWith('/')) {
      // Directory
      vfs.dirs.add(finalName.replace(/\/$/, ''));
    }

    offset += 512 + dataSize;
  }
}

/**
 * Decompress gzip and parse tar into a VFS
 * @param {ArrayBuffer} gzBuffer - gzipped tar data
 * @returns {Promise<VFS>}
 */
async function loadSysdiagnose(gzBuffer, onProgress) {
  onProgress?.('解压 gzip...');
  const pako = window.pako;
  const tarBuffer = pako.ungzip(new Uint8Array(gzBuffer));
  onProgress?.('解析 tar...');

  const vfs = new VFS();
  parseTar(tarBuffer, vfs);

  onProgress?.(`加载完成，${vfs.files.size} 个文件`);
  return vfs;
}
