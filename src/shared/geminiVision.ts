// Gemini API Vision integration for LastCall
// Analyzes leftover food photos to estimate remaining portions, title, diet tags, and allergens.

import type { DietTag } from './types';

export interface FoodAnalysisResult {
  title: string;
  estimated_servings: number;
  dietary_tags: DietTag[];
  allergens: string[];
  confidence_notes: string;
  source: 'gemini' | 'simulated';
}

const VALID_DIET_TAGS: Set<DietTag> = new Set([
  'vegetarian',
  'halal',
  'gluten_free',
  'vegan',
  'dairy_free',
  'kosher',
  'nut_free',
]);

function parseJsonSafe(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1));
  }
  return JSON.parse(cleaned);
}

/**
 * Analyzes a base64 image data URL using Google's Gemini Vision API.
 * Uses Google Interactions API with gemini-3.1-flash-lite (fast, responsive),
 * with graceful fallback to simulation if offline or error occurs.
 */
export async function analyzeFoodImage(base64DataUrl: string): Promise<FoodAnalysisResult> {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim();

  // Extract pure base64 and mime type
  const match = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  const mimeType = match ? match[1] : 'image/jpeg';
  const base64Data = match ? match[2] : base64DataUrl;

  if (apiKey) {
    try {
      const prompt = `You are an expert campus food recovery specialist at the University of South Florida (USF).
Analyze this photo of leftover catered food from a campus event or club meeting.
Carefully inspect the food items, trays, boxes, or slices to determine:
1. Title: Short descriptive food title (e.g., "Domino's Pepperoni & Cheese Pizzas", "Panera Bread Sandwich Platter", "Catered Mediterranean Bowls").
2. Estimated servings/portions remaining: Count the remaining slices, containers, or portions as accurately as possible. Output a positive whole integer between 1 and 200.
3. Dietary tags: Array of valid tags matching any of: "vegetarian", "halal", "gluten_free", "vegan", "dairy_free", "kosher", "nut_free". Only include tags you are confident about.
4. Allergens: Array of common allergens detected or likely present (e.g. "Dairy", "Gluten", "Nuts", "Soy", "Eggs", "Shellfish").
5. Confidence notes: One short concise sentence explaining the count (e.g., "Detected 2 pizza boxes with ~9 remaining slices total.").

Return strict JSON only:
{
  "title": "string",
  "estimated_servings": number,
  "dietary_tags": ["string"],
  "allergens": ["string"],
  "confidence_notes": "string"
}`;

      const interactionsUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(interactionsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gemini-3.1-flash-lite',
          input: [
            { type: 'text', text: prompt },
            { type: 'image', data: base64Data, mime_type: mimeType },
          ],
        }),
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        let extractedText = '';
        for (const step of data?.steps || []) {
          if (step.type === 'model_output') {
            for (const c of step.content || []) {
              if (c.text) extractedText += c.text;
            }
          }
        }

        if (extractedText) {
          const parsed = parseJsonSafe(extractedText);
          const sanitizedDietTags: DietTag[] = Array.isArray(parsed.dietary_tags)
            ? (parsed.dietary_tags
                .map((t: unknown) => String(t).toLowerCase().replace(/[\s-]/g, '_'))
                .filter((t: string) => VALID_DIET_TAGS.has(t as DietTag)) as DietTag[])
            : [];

          const servings = Math.max(1, Math.min(200, Math.round(Number(parsed.estimated_servings) || 10)));

          return {
            title: String(parsed.title || 'Rescued Meeting Catering').trim(),
            estimated_servings: servings,
            dietary_tags: sanitizedDietTags,
            allergens: Array.isArray(parsed.allergens) ? parsed.allergens.map(String) : [],
            confidence_notes: String(parsed.confidence_notes || `Gemini Vision identified ~${servings} portions.`),
            source: 'gemini',
          };
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed or timed out, falling back to smart simulation:', err);
    }
  }

  // Graceful simulation fallback for demo / offline / no API key
  await new Promise((resolve) => setTimeout(resolve, 800)); // natural AI latency feel
  return getSimulatedAnalysis();
}

function getSimulatedAnalysis(): FoodAnalysisResult {
  const presets: FoodAnalysisResult[] = [
    {
      title: "Domino's Pepperoni & Cheese Pizzas",
      estimated_servings: 12,
      dietary_tags: ['vegetarian'],
      allergens: ['Dairy', 'Gluten'],
      confidence_notes: 'AI Vision detected 2 pizza boxes with ~12 slices remaining.',
      source: 'simulated',
    },
    {
      title: 'Catered Wrap & Sandwich Platter',
      estimated_servings: 8,
      dietary_tags: ['halal'],
      allergens: ['Gluten', 'Eggs'],
      confidence_notes: 'AI Vision identified ~8 half-wraps remaining on catering tray.',
      source: 'simulated',
    },
    {
      title: 'Mediterranean Grain Bowls',
      estimated_servings: 6,
      dietary_tags: ['vegan', 'dairy_free', 'nut_free'],
      allergens: ['Gluten'],
      confidence_notes: 'AI Vision counted 6 sealed individual meal bowls.',
      source: 'simulated',
    },
  ];

  return presets[Math.floor(Math.random() * presets.length)];
}
