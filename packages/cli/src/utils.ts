export function parseGitUrl(input: string) {
  let owner = '';
  let repo = '';
  if (input.startsWith('git@')) {
    const m = input.match(/git@github\.com:([^/]+)\/([^/]+?)(\.git)?$/);
    if (!m) throw new Error(`Invalid git URL: ${input}`);
    owner = m[1];
    repo = m[2];
  } else {
    const u = new URL(input);
    const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2) throw new Error(`Invalid GitHub URL: ${input}`);
    owner = parts[0];
    repo = parts[1];
  }
  const slug = `${owner}-${repo}`;
  const url = `https://github.com/${owner}/${repo}`;
  return { owner, repo, slug, url };
}
