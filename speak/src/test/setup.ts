import 'fake-indexeddb/auto';
import { expect, vi } from 'vitest';

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): void;
    toHaveAttribute(attr: string, value?: string): void;
  }
  interface AsymmetricMatchersContaining {
    toBeInTheDocument(): void;
    toHaveAttribute(attr: string, value?: string): void;
  }
}

// 1. Extend Vitest Expect with DOM matchers
expect.extend({
  toBeInTheDocument(received: unknown) {
    const pass =
      received !== null &&
      received !== undefined &&
      typeof received === 'object' &&
      'nodeType' in received &&
      (document.body.contains(received as Node) || (received as HTMLElement).isConnected);
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to be in document`,
    };
  },
  toHaveAttribute(received: unknown, attr: string, value?: string) {
    if (!received || typeof received !== 'object' || !('getAttribute' in received)) {
      return { pass: false, message: () => `expected element to be an Element` };
    }
    const el = received as HTMLElement;
    const hasAttr = el.hasAttribute(attr);
    const pass = value !== undefined ? el.getAttribute(attr) === value : hasAttr;
    return {
      pass,
      message: () => `expected element ${pass ? 'not ' : ''}to have attribute ${attr}${value !== undefined ? `="${value}"` : ''}`,
    };
  },
});

// 2. Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// 3. Mock Web Audio AudioContext & AnalyserNode
class MockAudioContext {
  state = 'running';
  sampleRate = 44100;
  createAnalyser() {
    return {
      fftSize: 2048,
      frequencyBinCount: 1024,
      smoothingTimeConstant: 0.8,
      getFloatTimeDomainData: (arr: Float32Array) => arr.fill(0),
      getByteTimeDomainData: (arr: Uint8Array) => arr.fill(128),
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(0),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createMediaStreamSource() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: MockAudioContext,
});
Object.defineProperty(window, 'webkitAudioContext', {
  writable: true,
  value: MockAudioContext,
});

// 4. Mock MediaStream & navigator.mediaDevices.getUserMedia
class MockMediaStreamTrack {
  kind = 'audio';
  enabled = true;
  readyState = 'live';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
}

class MockMediaStream {
  tracks = [new MockMediaStreamTrack()];
  getAudioTracks() {
    return this.tracks;
  }
  getTracks() {
    return this.tracks;
  }
}

if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    value: {},
  });
}

Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
  writable: true,
  value: vi.fn().mockResolvedValue(new MockMediaStream()),
});

// 5. Mock MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  static isTypeSupported(mime: string) {
    return mime.includes('webm') || mime.includes('mp4');
  }

  constructor(public stream: unknown, public options?: unknown) {}

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  requestData() {}
}

Object.defineProperty(window, 'MediaRecorder', {
  writable: true,
  value: MockMediaRecorder,
});

// 6. Mock SpeechSynthesis with full EventTarget methods
Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  },
});
