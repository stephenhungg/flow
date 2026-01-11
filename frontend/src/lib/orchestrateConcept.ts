import { findSceneByConcept } from './sceneRegistry';

export type KeyFact = {
  text: string;
  source: string;
};

export type Callout = {
  text: string;
  anchor: 'center' | 'left' | 'right' | 'top' | 'bottom';
};

export type SubtitleLine = {
  t: number;
  text: string;
};

export type Source = {
  label: string;
  url: string;
};

export type GeminiOrchestrationResponse = {
  concept: string;
  sceneId: string;
  learningObjectives: string[];
  keyFacts: KeyFact[];
  callouts: Callout[];
  narrationScript: string;
  subtitleLines: SubtitleLine[];
  sources: Source[];
};

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function orchestrateConcept(
  transcript: string
): Promise<GeminiOrchestrationResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY not found');
  }

  // Find matching scene
  const scene = findSceneByConcept(transcript);
  
  const prompt = `You are an educational content creator for an immersive 3D learning experience. A user has requested to explore: "${transcript}"

Generate educational content including:
1. Learning objectives (3-5 bullet points)
2. Key facts (with sources)
3. Callouts for important points
4. A narration script
5. Subtitle timing
6. Sources for further reading

Return as JSON matching this structure:
{
  "concept": "${transcript}",
  "sceneId": "${scene?.id || 'default'}",
  "learningObjectives": ["objective1", "objective2"],
  "keyFacts": [{"text": "fact", "source": "source"}],
  "callouts": [{"text": "callout", "anchor": "center"}],
  "narrationScript": "full narration text",
  "subtitleLines": [{"t": 0, "text": "subtitle"}],
  "sources": [{"label": "Source", "url": "https://..."}]
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    return JSON.parse(jsonMatch[0]) as GeminiOrchestrationResponse;
  } catch (error) {
    console.error('Error orchestrating concept:', error);
    throw error;
  }
}
