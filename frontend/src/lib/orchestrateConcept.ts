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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function orchestrateConcept(
  transcript: string
): Promise<GeminiOrchestrationResponse> {
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
    // Use backend proxy to avoid CORS
    const response = await fetch(`${API_URL}/api/gemini/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `API error: ${response.status}`);
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
