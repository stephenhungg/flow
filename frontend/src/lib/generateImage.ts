const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function generateImageWithGemini(concept: string): Promise<string> {
  try {
    console.log('🎨 [GEMINI] Generating image for concept:', concept);

    const imagePrompt = `Generate a high-quality, detailed image of: ${concept}. The image should be suitable for conversion to a 3D Gaussian Splat environment. Describe a vivid, photorealistic scene.`;
    
    console.log('📝 [GEMINI] Image prompt:', imagePrompt);

    // Use backend proxy to avoid CORS
    const response = await fetch(`${API_URL}/api/gemini/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: imagePrompt })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('📦 [GEMINI] Response received');

    let imageUrl = '';
    
    // Try to extract image URL from response
    if (data.candidates?.[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (typeof part.imageUrl === 'string') {
          imageUrl = part.imageUrl;
          console.log('✅ [GEMINI] Image URL received:', imageUrl);
          break;
        }
        // Check for inline data (base64 image)
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          const base64 = part.inlineData.data;
          imageUrl = `data:${part.inlineData.mimeType};base64,${base64}`;
          console.log('✅ [GEMINI] Base64 image received');
          break;
        }
      }
    }

    // Try to extract URL from text response
    if (!imageUrl && data.candidates?.[0]?.content?.parts?.[0]?.text) {
      const text = data.candidates[0].content.parts[0].text;
      const urlMatch = text.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp)/i);
      if (urlMatch) {
        imageUrl = urlMatch[0];
        console.log('✅ [GEMINI] Image URL extracted from text:', imageUrl);
      }
    }

    if (!imageUrl) {
      // Gemini text models don't generate images directly
      // Return a placeholder or use the text description for Marble
      console.warn('⚠️ [GEMINI] No image URL in response - Gemini returned text description');
      throw new Error('Gemini did not return an image. The model may not support image generation.');
    }

    return imageUrl;
  } catch (error: any) {
    console.error('❌ [GEMINI] Error generating image:', error);
    throw error;
  }
}
