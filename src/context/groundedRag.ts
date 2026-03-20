import { chunkContextDocument, InMemoryContextEngine, type ContextDocument } from './contextEngine';
import type { EmbeddingProvider } from './embeddings';

interface LoggerLike {
  debug(message: string): void;
}

export interface GroundedRagResult {
  documents: ContextDocument[];
  references: string[];
  warnings: string[];
}

export interface GroundedRagOptions {
  trustedDomains: string[];
  trustedGitHubOrgs: string[];
}

interface RepositorySearchItem {
  full_name?: unknown;
  description?: unknown;
  html_url?: unknown;
  stargazers_count?: unknown;
  language?: unknown;
  topics?: unknown;
  owner?: unknown;
  name?: unknown;
}

export class GroundedRagService {
  constructor(
    private readonly embeddings: EmbeddingProvider,
    private readonly options: GroundedRagOptions,
    private readonly logger?: LoggerLike
  ) {}

  async retrieve(prompt: string): Promise<GroundedRagResult> {
    const query = this.normalizeQuery(prompt);
    if (!query) {
      return { documents: [], references: [], warnings: [] };
    }

    const warnings: string[] = [];
    const seedDocuments: ContextDocument[] = [];

    const [internetResult, wikipediaResult, githubResult, inspirationResult] = await Promise.allSettled([
      this.fetchInternetDocument(query),
      this.fetchWikipediaDocument(query),
      this.fetchGitHubDocuments(query),
      this.fetchDesignInspirationDocuments(prompt, query),
    ]);

    if (internetResult.status === 'fulfilled' && internetResult.value) {
      seedDocuments.push(internetResult.value);
    } else if (internetResult.status === 'rejected') {
      warnings.push(`Internet lookup failed: ${internetResult.reason instanceof Error ? internetResult.reason.message : String(internetResult.reason)}`);
    }

    if (wikipediaResult.status === 'fulfilled' && wikipediaResult.value) {
      seedDocuments.push(wikipediaResult.value);
    } else if (wikipediaResult.status === 'rejected') {
      warnings.push(`Wikipedia lookup failed: ${wikipediaResult.reason instanceof Error ? wikipediaResult.reason.message : String(wikipediaResult.reason)}`);
    }

    if (githubResult.status === 'fulfilled') {
      seedDocuments.push(...githubResult.value);
    } else {
      warnings.push(`GitHub retrieval failed: ${githubResult.reason instanceof Error ? githubResult.reason.message : String(githubResult.reason)}`);
    }

    if (inspirationResult.status === 'fulfilled') {
      seedDocuments.push(...inspirationResult.value);
    } else {
      warnings.push(`Design inspiration retrieval failed: ${inspirationResult.reason instanceof Error ? inspirationResult.reason.message : String(inspirationResult.reason)}`);
    }

    if (seedDocuments.length === 0) {
      return { documents: [], references: [], warnings };
    }

    const chunkedDocuments = seedDocuments.flatMap((doc) =>
      chunkContextDocument(doc, { maxChunkChars: 1800, overlapChars: 240 })
    );

    const contextEngine = new InMemoryContextEngine(this.embeddings);
    await contextEngine.index(chunkedDocuments);
    const matches = await contextEngine.query({ query, maxResults: 12 });

    const selectedDocuments: ContextDocument[] = [];
    const references: string[] = [];
    const seenReferenceKeys = new Set<string>();
    const chunksPerSource = new Map<string, number>();

    for (const match of matches) {
      const baseUri = match.document.uri;
      const count = chunksPerSource.get(baseUri) ?? 0;
      if (count >= 2) {
        continue;
      }

      selectedDocuments.push(match.document);
      chunksPerSource.set(baseUri, count + 1);

      if (!seenReferenceKeys.has(baseUri)) {
        seenReferenceKeys.add(baseUri);
        references.push(`${match.document.title ?? baseUri} (${baseUri})`);
      }

      if (selectedDocuments.length >= 8) {
        break;
      }
    }

    if (warnings.length > 0) {
      this.logger?.debug(`[RAG] Warnings: ${warnings.join(' | ')}`);
    }

    return {
      documents: selectedDocuments,
      references,
      warnings,
    };
  }

  private normalizeQuery(prompt: string): string {
    return prompt
      .replace(/[`#*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
  }

  private async fetchInternetDocument(query: string): Promise<ContextDocument | undefined> {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
      no_redirect: '1',
    });

    const url = `https://api.duckduckgo.com/?${params.toString()}`;
    const response = await this.fetchJsonWithTimeout(url, 7000, {
      Accept: 'application/json',
    });

    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const payload = response as Record<string, unknown>;
    const heading = this.cleanText(String(payload.Heading ?? ''));
    const abstractText = this.cleanText(String(payload.AbstractText ?? ''));
    const abstractUrl = String(payload.AbstractURL ?? '').trim();

    const lines: string[] = [];
    if (heading) {
      lines.push(`Heading: ${heading}`);
    }
    if (abstractText) {
      lines.push(`Summary: ${abstractText}`);
    }

    const relatedTopics = payload.RelatedTopics;
    if (Array.isArray(relatedTopics)) {
      const related = relatedTopics
        .slice(0, 5)
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return '';
          }
          const obj = entry as Record<string, unknown>;
          const text = this.cleanText(String(obj.Text ?? ''));
          const firstUrl = String(obj.FirstURL ?? '').trim();
          if (!text) {
            return '';
          }
          if (firstUrl && !this.isTrustedDomain(firstUrl)) {
            return '';
          }
          return firstUrl ? `- ${text} (${firstUrl})` : `- ${text}`;
        })
        .filter((item) => item.length > 0);

      if (related.length > 0) {
        lines.push('Related:');
        lines.push(...related);
      }
    }

    if (lines.length === 0) {
      return undefined;
    }

    const sourceUri = abstractUrl || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    if (abstractUrl && !this.isTrustedDomain(abstractUrl)) {
      return undefined;
    }

    return {
      id: `rag-web-${Date.now()}`,
      uri: sourceUri,
      title: heading ? `Internet: ${heading}` : `Internet: ${query}`,
      content: lines.join('\n'),
      updatedAt: Date.now(),
      source: 'memory',
      tags: ['external', 'internet', 'rag'],
    };
  }

  private async fetchWikipediaDocument(query: string): Promise<ContextDocument | undefined> {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }

    const encoded = encodeURIComponent(normalized.replace(/ /g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const response = await this.fetchJsonWithTimeout(url, 7000, {
      Accept: 'application/json',
    });

    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const payload = response as Record<string, unknown>;
    const title = this.cleanText(String(payload.title ?? normalized));
    const extract = this.cleanText(String(payload.extract ?? ''));

    const contentUrls = payload.content_urls;
    let pageUrl = `https://en.wikipedia.org/wiki/${encoded}`;
    if (contentUrls && typeof contentUrls === 'object') {
      const desktop = (contentUrls as Record<string, unknown>).desktop;
      if (desktop && typeof desktop === 'object') {
        const candidate = String((desktop as Record<string, unknown>).page ?? '').trim();
        if (candidate) {
          pageUrl = candidate;
        }
      }
    }

    if (!extract) {
      return undefined;
    }

    if (!this.isTrustedDomain(pageUrl)) {
      return undefined;
    }

    return {
      id: `rag-wikipedia-${Date.now()}`,
      uri: pageUrl,
      title: `Wikipedia: ${title}`,
      content: `${extract}\nSource: ${pageUrl}`,
      updatedAt: Date.now(),
      source: 'memory',
      tags: ['external', 'wikipedia', 'rag'],
    };
  }

  private async fetchGitHubDocuments(query: string): Promise<ContextDocument[]> {
    const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=3`;
    const response = await this.fetchJsonWithTimeout(searchUrl, 8000, {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });

    if (!response || typeof response !== 'object') {
      return [];
    }

    const items = Array.isArray((response as Record<string, unknown>).items)
      ? ((response as Record<string, unknown>).items as unknown[])
      : [];

    const docs: ContextDocument[] = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const repo = item as RepositorySearchItem;
      const fullName = String(repo.full_name ?? '').trim();
      const htmlUrl = String(repo.html_url ?? '').trim();
      if (!fullName || !htmlUrl) {
        continue;
      }

      const description = this.cleanText(String(repo.description ?? ''));
      const stars = Number(repo.stargazers_count ?? 0);
      const language = String(repo.language ?? '').trim();

      if (!this.isAllowedGitHubRepo(fullName)) {
        continue;
      }

      const topics = Array.isArray(repo.topics)
        ? (repo.topics as unknown[])
            .map((topic) => String(topic).trim())
            .filter((topic) => topic.length > 0)
        : [];

      const readme = await this.fetchGitHubReadme(fullName);
      const contentParts = [
        `Repository: ${fullName}`,
        description ? `Description: ${description}` : '',
        language ? `Primary language: ${language}` : '',
        stars > 0 ? `Stars: ${stars}` : '',
        topics.length > 0 ? `Topics: ${topics.slice(0, 10).join(', ')}` : '',
        `Source: ${htmlUrl}`,
        readme ? `README excerpt:\n${this.truncate(readme, 5000)}` : '',
      ].filter((part) => part.length > 0);

      docs.push({
        id: `rag-github-${fullName}-${Date.now()}`,
        uri: htmlUrl,
        title: `GitHub: ${fullName}`,
        content: contentParts.join('\n\n'),
        updatedAt: Date.now(),
        source: 'memory',
        tags: ['external', 'github', 'rag', ...fullName.split('/')],
      });
    }

    return docs;
  }

  private async fetchGitHubReadme(fullName: string): Promise<string | undefined> {
    const url = `https://api.github.com/repos/${fullName}/readme`;
    const response = await this.fetchJsonWithTimeout(url, 8000, {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });

    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const payload = response as Record<string, unknown>;
    const encodedContent = String(payload.content ?? '').trim();
    const encoding = String(payload.encoding ?? '').trim().toLowerCase();
    if (!encodedContent || encoding !== 'base64') {
      return undefined;
    }

    try {
      const normalized = encodedContent.replace(/\n/g, '');
      const decoded = Buffer.from(normalized, 'base64').toString('utf-8');
      return this.cleanText(decoded);
    } catch {
      return undefined;
    }
  }

  private async fetchDesignInspirationDocuments(
    prompt: string,
    query: string
  ): Promise<ContextDocument[]> {
    if (!this.isDesignPrompt(prompt)) {
      return [];
    }

    const searchQuery = `${query} portfolio website ui ux inspiration`;
    const searchUrl = `https://r.jina.ai/http://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`;
    const rawSearch = await this.fetchTextWithTimeout(searchUrl, 10000);
    if (!rawSearch.trim()) {
      return [];
    }

    const links = this.extractTrustedLinks(rawSearch).slice(0, 6);
    if (links.length === 0) {
      return [];
    }

    const excerpts: string[] = [];
    for (const link of links.slice(0, 3)) {
      try {
        const pageText = await this.fetchTextWithTimeout(`https://r.jina.ai/http://${link.replace(/^https?:\/\//, '')}`, 10000);
        if (!pageText.trim()) {
          continue;
        }
        excerpts.push(`Source: ${link}\n${this.truncate(this.cleanText(pageText), 1200)}`);
      } catch {
        excerpts.push(`Source: ${link}`);
      }
    }

    const doc: ContextDocument = {
      id: `rag-design-${Date.now()}`,
      uri: `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`,
      title: 'Design inspiration search results',
      content: [
        `Query: ${searchQuery}`,
        'Top trusted inspiration links:',
        ...links.map((link) => `- ${link}`),
        'Extracted inspiration notes:',
        ...excerpts,
      ].join('\n\n'),
      updatedAt: Date.now(),
      source: 'memory',
      tags: ['external', 'design', 'ui-ux', 'inspiration', 'rag'],
    };

    return [doc];
  }

  private isDesignPrompt(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return /(ui|ux|frontend|website|landing|portfolio|design|hero section|color palette)/.test(lower);
  }

  private extractTrustedLinks(text: string): string[] {
    const matchedUrls = text.match(/https?:\/\/[^\s)\]]+/g) ?? [];
    const normalizedUrls = matchedUrls.map((item) => item.replace(/[),.;]+$/, ''));
    const urls = [...new Set(normalizedUrls)];
    return urls
      .filter((url) => !/duckduckgo\.com\/l\//i.test(url))
      .filter((url) => this.isTrustedDomain(url));
  }

  private async fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/plain, text/html;q=0.9, */*;q=0.8',
          'User-Agent': 'Klyr-VSCode-Extension/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJsonWithTimeout(
    url: string,
    timeoutMs: number,
    headers: Record<string, string>
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...headers,
          'User-Agent': 'Klyr-VSCode-Extension/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private cleanText(value: string): string {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) {
      return value;
    }
    return `${value.slice(0, maxChars)}\n...<truncated>`;
  }

  private isTrustedDomain(urlValue: string): boolean {
    try {
      const host = new URL(urlValue).hostname.toLowerCase();
      const allowed = this.options.trustedDomains.map((domain) => domain.toLowerCase());

      if (allowed.length === 0) {
        return true;
      }

      return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  }

  private isAllowedGitHubRepo(fullName: string): boolean {
    const allowedOrgs = this.options.trustedGitHubOrgs.map((org) => org.toLowerCase());
    if (allowedOrgs.length === 0) {
      return true;
    }

    const owner = fullName.split('/')[0]?.toLowerCase() ?? '';
    return allowedOrgs.includes(owner);
  }
}
