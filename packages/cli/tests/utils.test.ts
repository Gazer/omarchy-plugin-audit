import { describe, it, expect } from 'vitest';
import { parseGitUrl } from '../src/utils.js';

describe('parseGitUrl', () => {
  it('parses https url', () => {
    expect(parseGitUrl('https://github.com/jankeesvw/omarchy-downloads')).toEqual({
      owner: 'jankeesvw',
      repo: 'omarchy-downloads',
      slug: 'jankeesvw-omarchy-downloads',
      url: 'https://github.com/jankeesvw/omarchy-downloads',
    });
  });
  it('parses https with .git', () => {
    expect(parseGitUrl('https://github.com/jankeesvw/omarchy-downloads.git')).toMatchObject({
      slug: 'jankeesvw-omarchy-downloads',
    });
  });
  it('parses git@ url', () => {
    expect(parseGitUrl('git@github.com:jankeesvw/omarchy-downloads.git')).toMatchObject({
      slug: 'jankeesvw-omarchy-downloads',
    });
  });
});
