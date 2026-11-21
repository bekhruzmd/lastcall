import { describe, it, expect, vi } from 'vitest';
import { analyzeFoodImage } from './geminiVision';

describe('analyzeFoodImage', () => {
  it('returns valid analysis result with expected shape on fallback/simulation', async () => {
    const fakeDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await analyzeFoodImage(fakeDataUrl);

    expect(result).toHaveProperty('title');
    expect(typeof result.title).toBe('string');
    expect(result.estimated_servings).toBeGreaterThan(0);
    expect(Array.isArray(result.dietary_tags)).toBe(true);
    expect(Array.isArray(result.allergens)).toBe(true);
    expect(typeof result.confidence_notes).toBe('string');
    expect(['gemini', 'simulated']).toContain(result.source);
  });

  it('parses valid responses from Gemini API format', async () => {
    const fakeDataUrl = 'data:image/jpeg;base64,12345';
    
    // Mock global fetch to test the Interactions API parsing
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        steps: [
          {
            type: 'model_output',
            content: [
              {
                text: JSON.stringify({
                  title: 'Fresh Chipotle Burrito Bowls',
                  estimated_servings: 14,
                  dietary_tags: ['vegetarian', 'gluten_free'],
                  allergens: ['Dairy'],
                  confidence_notes: 'Counted 14 individual lidded bowls.'
                })
              }
            ]
          }
        ]
      })
    }) as any;

    try {
      const result = await analyzeFoodImage(fakeDataUrl);
      expect(result.title).toBe('Fresh Chipotle Burrito Bowls');
      expect(result.estimated_servings).toBe(14);
      expect(result.dietary_tags).toContain('vegetarian');
      expect(result.dietary_tags).toContain('gluten_free');
      expect(result.allergens).toContain('Dairy');
      expect(result.source).toBe('gemini');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
