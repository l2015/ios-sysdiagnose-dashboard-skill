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

    // Handle GNU long name (>100 chars, stored in next entry with type 'L')
    const typeFlag = String.fromCharCode(buffer[offset + 156]);
    let longName = null;

    if (typeFlag === 'L') {
      // GNU long name entry — the data block contains the full name
      const sizeOctal = new TextDecoder().decode(buffer.subarray(offset + 124, offset + 136)).trim();
      const size = parseInt(sizeOctal, 8);
      const dataSize = Math.ceil(size / 512) * 512;
      const nameData = buffer.subarray(offset + 512, offset + 512 + size);
      longName = new TextDecoder().decode(nameData).replace(/\0/g, '');
      offset += 512 + dataSize;
      continue;
    }

    // Check for POSIX extended header (type 'x' or 'g')
    if (typeFlag === 'x' || typeFlag === 'g') {
      const sizeOctal = new TextDecoder().decode(buffer.subarray(offset + 124, offset + 136)).trim();
      const size = parseInt(sizeOctal, 8);
      const dataSize = Math.ceil(size / 512) * 512;

      // Parse extended header for path
      const headerData = new TextDecoder().decode(buffer.subarray(offset + 512, offset + 512 + size));
      const pathMatch = headerData.match(/\d+ path=(.+)/);
      if (pathMatch) longName = pathMatch[1].trim();

      offset += 512 + dataSize;
      continue;
    }

    // Read size
    const sizeOctal = new TextDecoder().decode(buffer.subarray(offset + 124, offset + 136)).trim();
    const size = parseInt(sizeOctal, 8) || 0;
    const dataSize = Math.ceil(size / 512) * 512;

    // Use long name if available
    const finalName = longName || name;

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
