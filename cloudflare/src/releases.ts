const RELEASE_API_URL = 'https://api.github.com/repos/eusilvamateus/onframe/releases/latest';
const RELEASE_PAGE_PREFIX = 'https://github.com/eusilvamateus/onframe/releases/tag/';
const VERSION_PATTERN = /^v?(\d+\.\d+\.\d+)$/u;

type GitHubRelease = {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
};

export async function latestOnFrameRelease(fetcher: typeof fetch = fetch): Promise<Record<string, string | null>> {
  const response = await fetcher(RELEASE_API_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'onframe-worker'
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 900
    }
  });

  if (!response.ok) throw new Error(`release_lookup_failed:${response.status}`);

  const release = await response.json() as GitHubRelease;
  const version = String(release.tag_name || '').match(VERSION_PATTERN)?.[1];
  const changelogUrl = String(release.html_url || '');
  if (!version || !changelogUrl.startsWith(RELEASE_PAGE_PREFIX)) throw new Error('release_payload_invalid');

  return {
    latestVersion: version,
    changelogUrl,
    publishedAt: release.published_at || null
  };
}
