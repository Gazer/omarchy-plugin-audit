import { describe, it, expect } from 'vitest';
import { detectObfuscation } from '../src/analyzer/obfuscation.js';

describe('obfuscation', () => {
  it('flags base64 long', () => {
    const b64 = Buffer.from('eval("http://evil.com")').toString('base64');
    const long = `var x="${'A'.repeat(100)}${b64}${'B'.repeat(30)}";`;
    expect(detectObfuscation('a.qml', long).some((f) => f.type === 'base64')).toBe(true);
  });
  it('flags eval dynamic', () => {
    expect(detectObfuscation('a.qml', `eval(someVar + "evil")`).some((f) => f.type === 'eval-dynamic')).toBe(true);
  });
  it('clean has no flags', () => {
    expect(detectObfuscation('clean.qml', `import QtQuick\nText { text: "hello" }`).length).toBe(0);
  });
  it('flags hex escapes', () => {
    const hex = Array(12).fill('\\x41').join('');
    expect(detectObfuscation('a.qml', `var s="${hex}"`).some((f) => f.type === 'hex-escapes')).toBe(true);
  });
  it('flags fromCharCode', () => {
    expect(detectObfuscation('a.qml', `String.fromCharCode(72,101)`).some((f) => f.type === 'fromCharCode')).toBe(true);
  });
});
