/**
 * utils.test.js - Unit tests for utils module
 */

const { sanitizeId, maskAuthInUrl, sanitizeUrl } = require('../lib/utils');

describe('Utils Module', () => {
  describe('sanitizeId', () => {
    it('should sanitize special characters', () => {
      expect(sanitizeId('My Project!')).toBe('my-project');
    });

    it('should replace multiple dashes with single dash', () => {
      expect(sanitizeId('foo---bar')).toBe('foo-bar');
    });

    it('should trim leading and trailing special chars', () => {
      expect(sanitizeId('---foo---')).toBe('foo');
    });

    it('should limit length', () => {
      expect(sanitizeId('a'.repeat(50), 10)).toHaveLength(10);
    });

    it('should handle empty input', () => {
      expect(sanitizeId('')).toBe('ci');
    });

    it('should preserve dots and hyphens', () => {
      expect(sanitizeId('my.project-name')).toBe('my.project-name');
    });
  });

  describe('maskAuthInUrl', () => {
    it('should mask auth parameter', () => {
      const url = 'https://example.com?auth=secret123';
      expect(maskAuthInUrl(url)).toBe('https://example.com?auth=****');
    });

    it('should mask auth parameter in middle of query string', () => {
      const url = 'https://example.com?foo=bar&auth=secret123&baz=qux';
      expect(maskAuthInUrl(url)).toBe('https://example.com?foo=bar&auth=****&baz=qux');
    });

    it('should handle multiple auth parameters', () => {
      const url = 'https://example.com?auth=secret1&auth=secret2';
      expect(maskAuthInUrl(url)).toBe('https://example.com?auth=****&auth=****');
    });

    it('should handle empty string', () => {
      expect(maskAuthInUrl('')).toBe('');
    });

    it('should handle URL without auth', () => {
      const url = 'https://example.com?foo=bar';
      expect(maskAuthInUrl(url)).toBe(url);
    });
  });

  describe('sanitizeUrl', () => {
    it('should remove BOM', () => {
      expect(sanitizeUrl('\uFEFFhttps://example.com')).toBe('https://example.com');
    });

    it('should remove quotes', () => {
      expect(sanitizeUrl('"https://example.com"')).toBe('https://example.com');
      expect(sanitizeUrl("'https://example.com'")).toBe('https://example.com');
    });

    it('should remove trailing newlines', () => {
      expect(sanitizeUrl('https://example.com\n\r')).toBe('https://example.com');
    });

    it('should handle null', () => {
      expect(sanitizeUrl(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(sanitizeUrl(undefined)).toBe('');
    });
  });
});
