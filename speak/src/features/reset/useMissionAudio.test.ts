import { pickMimeType } from './useMissionAudio';

describe('recording container choice', () => {
  // Safari/iOS produces only `audio/mp4`; Chrome and Firefox only `audio/webm`.
  // Passing an unsupported string to `MediaRecorder` throws, which would lose
  // the attempt on the one device this app is built for.
  it('prefers mp4 where Safari supports it', () => {
    expect(pickMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
  });

  it('falls back to webm on Chrome and Firefox', () => {
    expect(pickMimeType((type) => type.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
  });

  it('returns an empty string when nothing is supported, so the browser picks', () => {
    expect(pickMimeType(() => false)).toBe('');
  });
});
