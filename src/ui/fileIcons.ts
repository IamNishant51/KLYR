export interface FileIconInfo {
  codicon: string;
  color: string;
  label: string;
}

const fileIconMap: Record<string, FileIconInfo> = {
  // JavaScript/TypeScript
  js: { codicon: 'symbol-numeric', color: '#f7df1e', label: 'JavaScript' },
  jsx: { codicon: 'symbol-numeric', color: '#61dafb', label: 'React' },
  ts: { codicon: 'symbol-numeric', color: '#3178c6', label: 'TypeScript' },
  tsx: { codicon: 'symbol-numeric', color: '#3178c6', label: 'React TS' },
  mjs: { codicon: 'symbol-numeric', color: '#f7df1e', label: 'JavaScript Module' },
  cjs: { codicon: 'symbol-numeric', color: '#f7df1e', label: 'JavaScript CommonJS' },
  
  // JSON
  json: { codicon: 'json', color: '#f5a623', label: 'JSON' },
  jsonc: { codicon: 'json', color: '#f5a623', label: 'JSON' },
  
  // HTML
  html: { codicon: 'globe', color: '#e34c26', label: 'HTML' },
  htm: { codicon: 'globe', color: '#e34c26', label: 'HTML' },
  xhtml: { codicon: 'globe', color: '#e34c26', label: 'HTML' },
  
  // CSS
  css: { codicon: 'paintcan', color: '#264de4', label: 'CSS' },
  scss: { codicon: 'paintcan', color: '#c6538c', label: 'SCSS' },
  sass: { codicon: 'paintcan', color: '#c6538c', label: 'Sass' },
  less: { codicon: 'paintcan', color: '#1d365d', label: 'Less' },
  
  // Python
  py: { codicon: 'symbol-string', color: '#3776ab', label: 'Python' },
  pyw: { codicon: 'symbol-string', color: '#3776ab', label: 'Python' },
  pyi: { codicon: 'symbol-string', color: '#3776ab', label: 'Python Stub' },
  
  // Java
  java: { codicon: 'coffee', color: '#b07219', label: 'Java' },
  
  // C/C++
  c: { codicon: 'file-code', color: '#555555', label: 'C' },
  cpp: { codicon: 'file-code', color: '#f34b7d', label: 'C++' },
  cc: { codicon: 'file-code', color: '#f34b7d', label: 'C++' },
  cxx: { codicon: 'file-code', color: '#f34b7d', label: 'C++' },
  h: { codicon: 'file-code', color: '#555555', label: 'C Header' },
  hpp: { codicon: 'file-code', color: '#f34b7d', label: 'C++ Header' },
  
  // C#
  cs: { codicon: 'symbol-numeric', color: '#178600', label: 'C#' },
  
  // Go
  go: { codicon: 'file-code', color: '#00add8', label: 'Go' },
  
  // Rust
  rs: { codicon: 'file-code', color: '#dea584', label: 'Rust' },
  
  // Ruby
  rb: { codicon: 'gem', color: '#cc342d', label: 'Ruby' },
  
  // PHP
  php: { codicon: 'file-code', color: '#4f5d95', label: 'PHP' },
  
  // Swift
  swift: { codicon: 'file-code', color: '#f05138', label: 'Swift' },
  
  // Kotlin
  kt: { codicon: 'file-code', color: '#7f52ff', label: 'Kotlin' },
  kts: { codicon: 'file-code', color: '#7f52ff', label: 'Kotlin Script' },
  
  // Markdown
  md: { codicon: 'book', color: '#083fa1', label: 'Markdown' },
  mdx: { codicon: 'book', color: '#083fa1', label: 'MDX' },
  markdown: { codicon: 'book', color: '#083fa1', label: 'Markdown' },
  
  // Config files
  yaml: { codicon: 'settings-gear', color: '#cb171e', label: 'YAML' },
  yml: { codicon: 'settings-gear', color: '#cb171e', label: 'YAML' },
  toml: { codicon: 'settings-gear', color: '#9c4221', label: 'TOML' },
  ini: { codicon: 'settings-gear', color: '#6d8086', label: 'INI' },
  cfg: { codicon: 'settings-gear', color: '#6d8086', label: 'Config' },
  conf: { codicon: 'settings-gear', color: '#6d8086', label: 'Config' },
  xml: { codicon: 'code', color: '#0060ac', label: 'XML' },
  
  // Shell
  sh: { codicon: 'terminal-bash', color: '#89e051', label: 'Shell' },
  bash: { codicon: 'terminal-bash', color: '#89e051', label: 'Bash' },
  zsh: { codicon: 'terminal-bash', color: '#89e051', label: 'Zsh' },
  fish: { codicon: 'terminal-bash', color: '#89e051', label: 'Fish' },
  ps1: { codicon: 'terminal-powershell', color: '#012456', label: 'PowerShell' },
  
  // SQL
  sql: { codicon: 'database', color: '#e38c00', label: 'SQL' },
  
  // Images
  png: { codicon: 'file-media', color: '#a074c4', label: 'PNG Image' },
  jpg: { codicon: 'file-media', color: '#a074c4', label: 'JPEG Image' },
  jpeg: { codicon: 'file-media', color: '#a074c4', label: 'JPEG Image' },
  gif: { codicon: 'file-media', color: '#a074c4', label: 'GIF Image' },
  svg: { codicon: 'file-media', color: '#ffb13b', label: 'SVG Image' },
  webp: { codicon: 'file-media', color: '#a074c4', label: 'WebP Image' },
  ico: { codicon: 'file-media', color: '#a074c4', label: 'Icon' },
  
  // Fonts
  ttf: { codicon: 'symbol-key', color: '#a074c4', label: 'Font' },
  otf: { codicon: 'symbol-key', color: '#a074c4', label: 'Font' },
  woff: { codicon: 'symbol-key', color: '#a074c4', label: 'Font' },
  woff2: { codicon: 'symbol-key', color: '#a074c4', label: 'Font' },
  
  // Docs
  pdf: { codicon: 'book', color: '#f85149', label: 'PDF' },
  doc: { codicon: 'book', color: '#295636', label: 'Word Document' },
  docx: { codicon: 'book', color: '#295636', label: 'Word Document' },
  txt: { codicon: 'document', color: '#9fb0c3', label: 'Text File' },
  
  // Archive
  zip: { codicon: 'file-zip', color: '#a074c4', label: 'ZIP Archive' },
  tar: { codicon: 'file-zip', color: '#a074c4', label: 'TAR Archive' },
  gz: { codicon: 'file-zip', color: '#a074c4', label: 'GZIP Archive' },
  
  // Docker
  dockerfile: { codicon: 'box', color: '#384d54', label: 'Dockerfile' },
  
  // Vue
  vue: { codicon: 'code', color: '#42b883', label: 'Vue' },
  
  // Svelte
  svelte: { codicon: 'code', color: '#ff3e00', label: 'Svelte' },
  
  // GraphQL
  graphql: { codicon: 'graph', color: '#e10098', label: 'GraphQL' },
  gql: { codicon: 'graph', color: '#e10098', label: 'GraphQL' },
  
  // Environment
  env: { codicon: 'lock', color: '#ecd53f', label: 'Environment' },
  gitignore: { codicon: 'git-branch', color: '#f14e32', label: 'Git Ignore' },
  gitkeep: { codicon: 'git-branch', color: '#f14e32', label: 'Git Keep' },
  gitattributes: { codicon: 'git-branch', color: '#f14e32', label: 'Git Attributes' },
  
  // License
  license: { codicon: 'law', color: '#6d8086', label: 'License' },
  licence: { codicon: 'law', color: '#6d8086', label: 'License' },
  
  // Package files
  packagejson: { codicon: 'package', color: '#cb171e', label: 'Package' },
  packagelockjson: { codicon: 'package', color: '#3c873a', label: 'Lock File' },
  npmrc: { codicon: 'settings-gear', color: '#cb171e', label: 'NPM Config' },
  yarnlock: { codicon: 'package', color: '#2c8ebb', label: 'Yarn Lock' },
  pnpmlock: { codicon: 'package', color: '#f9a825', label: 'PNPM Lock' },
  cargo: { codicon: 'package', color: '#dea584', label: 'Cargo' },
  gemfile: { codicon: 'gem', color: '#cc342d', label: 'Gemfile' },
  requirements: { codicon: 'package', color: '#3776ab', label: 'Requirements' },
  pipfile: { codicon: 'package', color: '#6d8086', label: 'Pipfile' },
  
  // Test files
  test: { codicon: 'beaker', color: '#4fc430', label: 'Test' },
  spec: { codicon: 'beaker', color: '#4fc430', label: 'Test' },
  
  // Build files
  makefile: { codicon: 'hammer', color: '#6d8086', label: 'Makefile' },
  cmake: { codicon: 'hammer', color: '#6d8086', label: 'CMake' },
  gradle: { codicon: 'hammer', color: '#02303a', label: 'Gradle' },
  webpack: { codicon: 'package', color: '#8dd6f9', label: 'Webpack' },
  vite: { codicon: 'zap', color: '#646cff', label: 'Vite' },
  esbuild: { codicon: 'zap', color: '#ffcf00', label: 'ESBuild' },
  parcel: { codicon: 'package', color: '#4fc430', label: 'Parcel' },
  rollup: { codicon: 'package', color: '#ec4a47', label: 'Rollup' },
  
  // Lint files
  eslintrc: { codicon: 'checklist', color: '#4b32c3', label: 'ESLint' },
  prettierrc: { codicon: 'checklist', color: '#56b3b4', label: 'Prettier' },
  stylelintrc: { codicon: 'checklist', color: '#264de4', label: 'Stylelint' },
  tslint: { codicon: 'checklist', color: '#3178c6', label: 'TSLint' },
};

const defaultIcon: FileIconInfo = {
  codicon: 'file-text',
  color: '#9fb0c3',
  label: 'File'
};

export function getFileIcon(filePath: string): FileIconInfo {
  const lowerPath = filePath.toLowerCase();
  
  // Check for exact filenames first
  const exactNames: Record<string, FileIconInfo> = {
    'dockerfile': { codicon: 'box', color: '#384d54', label: 'Dockerfile' },
    'makefile': { codicon: 'hammer', color: '#6d8086', label: 'Makefile' },
    'gemfile': { codicon: 'gem', color: '#cc342d', label: 'Gemfile' },
    'package.json': { codicon: 'package', color: '#cb171e', label: 'Package' },
    'package-lock.json': { codicon: 'package', color: '#3c873a', label: 'Lock File' },
    'tsconfig.json': { codicon: 'symbol-numeric', color: '#3178c6', label: 'TSConfig' },
    'jsconfig.json': { codicon: 'symbol-numeric', color: '#f7df1e', label: 'JSConfig' },
    'vite.config.js': { codicon: 'zap', color: '#646cff', label: 'Vite Config' },
    'vite.config.ts': { codicon: 'zap', color: '#646cff', label: 'Vite Config' },
    'vite.config.mjs': { codicon: 'zap', color: '#646cff', label: 'Vite Config' },
    '.eslintrc': { codicon: 'checklist', color: '#4b32c3', label: 'ESLint' },
    '.eslintrc.json': { codicon: 'checklist', color: '#4b32c3', label: 'ESLint' },
    '.eslintrc.js': { codicon: 'checklist', color: '#4b32c3', label: 'ESLint' },
    '.prettierrc': { codicon: 'checklist', color: '#56b3b4', label: 'Prettier' },
    '.prettierrc.json': { codicon: 'checklist', color: '#56b3b4', label: 'Prettier' },
    '.gitignore': { codicon: 'git-branch', color: '#f14e32', label: 'Git Ignore' },
    '.gitattributes': { codicon: 'git-branch', color: '#f14e32', label: 'Git Attributes' },
    '.env': { codicon: 'lock', color: '#ecd53f', label: 'Environment' },
    '.env.local': { codicon: 'lock', color: '#ecd53f', label: 'Environment Local' },
    '.env.development': { codicon: 'lock', color: '#ecd53f', label: 'Environment Dev' },
    '.env.production': { codicon: 'lock', color: '#ecd53f', label: 'Environment Prod' },
    'cargo.toml': { codicon: 'package', color: '#dea584', label: 'Cargo' },
    'cargo.lock': { codicon: 'package', color: '#dea584', label: 'Cargo Lock' },
    'requirements.txt': { codicon: 'package', color: '#3776ab', label: 'Requirements' },
    'pipfile': { codicon: 'package', color: '#6d8086', label: 'Pipfile' },
    'license': { codicon: 'law', color: '#6d8086', label: 'License' },
    'readme': { codicon: 'book', color: '#9fb0c3', label: 'Readme' },
    'changelog': { codicon: 'history', color: '#9fb0c3', label: 'Changelog' },
  };
  
  for (const [name, icon] of Object.entries(exactNames)) {
    if (lowerPath.endsWith(name)) {
      return icon;
    }
  }
  
  // Check for Dockerfile variations
  if (lowerPath.includes('dockerfile')) {
    return { codicon: 'box', color: '#384d54', label: 'Dockerfile' };
  }
  
  // Extract extension
  const parts = lowerPath.split('.');
  if (parts.length >= 2) {
    const ext = parts[parts.length - 1];
    
    // Handle .d.ts, .d.tsx, .test.ts etc
    if (parts.length >= 3) {
      const secondLast = parts[parts.length - 2];
      
      // TypeScript definition files
      if (secondLast === 'd') {
        return { codicon: 'symbol-numeric', color: '#3178c6', label: 'TypeScript Definition' };
      }
      
      // Test files
      if (secondLast === 'test' || secondLast === 'spec' || secondLast === 'tests') {
        const testExt = parts[parts.length - 1];
        if (testExt in fileIconMap) {
          const baseIcon = fileIconMap[testExt];
          return { ...baseIcon, label: `${baseIcon.label} Test` };
        }
      }
    }
    
    if (ext in fileIconMap) {
      return fileIconMap[ext];
    }
  }
  
  return defaultIcon;
}

export function getFileIconHtml(filePath: string): string {
  const icon = getFileIcon(filePath);
  return `<span class="file-icon" data-codicon="${icon.codicon}" style="color: ${icon.color};" title="${icon.label}">$(${icon.codicon})</span>`;
}

export function getAllSupportedExtensions(): string[] {
  return Object.keys(fileIconMap);
}
