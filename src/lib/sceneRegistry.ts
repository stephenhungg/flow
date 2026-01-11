export type SceneEntry = {
  id: string;
  title: string;
  splatLowUrl: string;
  splatHighUrl?: string;
  tags: string[];
};

export const sceneRegistry: SceneEntry[] = [
  {
    id: 'ancient_rome',
    title: 'Ancient Rome',
    // File doesn't exist yet - will generate via API or use fallback
    splatLowUrl: 'https://sparkjs.dev/assets/splats/butterfly.spz', // Fallback to demo scene
    tags: ['rome', 'ancient', 'roman', 'empire', 'forum', 'colosseum', 'architecture', 'history']
  },
  {
    id: 'photosynthesis',
    title: 'Photosynthesis',
    splatLowUrl: '/scenes/photosynthesis.spz',
    tags: ['biology', 'plants', 'science', 'cells', 'chloroplast', 'energy']
  },
  {
    id: 'quantum_mechanics',
    title: 'Quantum Mechanics',
    splatLowUrl: '/scenes/quantum_mechanics.spz',
    tags: ['physics', 'quantum', 'atoms', 'particles', 'science', 'chemistry']
  },
  {
    id: 'european_cobblestone_lane',
    title: 'European Cobblestone Lane',
    splatLowUrl: '/scenes/narrow_european_cobblestone_lane_2m.spz',
    tags: ['european', 'cobblestone', 'street', 'lane', 'alley', 'architecture', 'historic', 'medieval', 'old town']
  },
  // Test scene from SparkJS docs (for development/testing)
  {
    id: 'butterfly',
    title: 'Butterfly',
    splatLowUrl: 'https://sparkjs.dev/assets/splats/butterfly.spz',
    tags: ['test', 'demo', 'example']
  }
];

export function findSceneByConcept(concept: string): SceneEntry | null {
  const lowerConcept = concept.toLowerCase();
  
  // Exact match first
  const exactMatch = sceneRegistry.find(
    scene => scene.id === lowerConcept.replace(/\s+/g, '_')
  );
  if (exactMatch) return exactMatch;
  
  // Tag-based fuzzy match
  let bestMatch: SceneEntry | null = null;
  let bestScore = 0;
  
  for (const scene of sceneRegistry) {
    let score = 0;
    for (const tag of scene.tags) {
      if (lowerConcept.includes(tag) || tag.includes(lowerConcept)) {
        score += 2;
      }
      // Partial word matches
      const words = lowerConcept.split(/\s+/);
      for (const word of words) {
        if (tag.includes(word) || word.includes(tag)) {
          score += 1;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = scene;
    }
  }
  
  return bestMatch || sceneRegistry[0]; // Fallback to first scene
}
