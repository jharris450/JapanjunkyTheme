import { describe, it, expect } from 'vitest';
import AU from '../assets/japanjunky-audio-util.js';

describe('parseYouTubeId', () => {
  it('parses watch?v= URLs', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses watch URLs with extra params', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtu.be short URLs', () => {
    expect(AU.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtu.be with params', () => {
    expect(AU.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=1')).toBe('dQw4w9WgXcQ');
  });
  it('parses /embed/ URLs', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('returns empty for non-YouTube / empty / null', () => {
    expect(AU.parseYouTubeId('https://example.com/song.mp3')).toBe('');
    expect(AU.parseYouTubeId('')).toBe('');
    expect(AU.parseYouTubeId(null)).toBe('');
    expect(AU.parseYouTubeId(undefined)).toBe('');
  });
  it('rejects IDs longer than 11 chars (no silent truncation)', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ_')).toBe('');
    expect(AU.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ_')).toBe('');
  });
  it('prefers embed path id over a v= query param when both present', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/embed/AAAAAAAAAAA?v=BBBBBBBBBBB')).toBe('AAAAAAAAAAA');
  });
});

describe('choosePath', () => {
  it('prefers a self-hosted file', () => {
    expect(AU.choosePath({ audioUrl: 'a.mp3', youtubeUrl: 'https://youtu.be/x' })).toBe('file');
    expect(AU.choosePath({ audioUrl: 'a.mp3' })).toBe('file');
  });
  it('falls back to youtube when only a youtube link exists', () => {
    expect(AU.choosePath({ youtubeUrl: 'https://youtu.be/x' })).toBe('youtube');
  });
  it('falls back to static when neither exists', () => {
    expect(AU.choosePath({})).toBe('static');
    expect(AU.choosePath({ audioUrl: '', youtubeUrl: '' })).toBe('static');
    expect(AU.choosePath(null)).toBe('static');
  });
  it('treats undefined fields as static', () => {
    expect(AU.choosePath({ audioUrl: undefined, youtubeUrl: undefined })).toBe('static');
  });
});
