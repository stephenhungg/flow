import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function generateImageWithGemini(concept: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY not found. Please add it to your .env file.');
  }

  try {
    console.log('🎨 [GEMINI] Generating image for concept:', concept);

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    
    let model;
    try {
      model = await genAI.getGenerativeModel({ model: 'gemini-2.5-flash-image-preview' });
      console.log('✅ [GEMINI] Using gemini-2.5-flash-image-preview');
    } catch (e: any) {
      console.warn('⚠️ [GEMINI] gemini-2.5-flash-image-preview not available, trying alternatives...');
      
      const fallbackModels = ['gemini-2.0-flash-exp', 'gemini-pro-vision'];
      for (const modelName of fallbackModels) {
        try {
          model = await genAI.getGenerativeModel({ model: modelName });
          console.log(`✅ [GEMINI] Using fallback model: ${modelName}`);
          break;
        } catch (e2: any) {
          console.warn(`⚠️ [GEMINI] ${modelName} not available: ${e2.message}`);
        }
      }
      
      if (!model) {
        throw new Error('No available Gemini image generation model');
      }
    }

    const imagePrompt = `Generate a high-quality, detailed image of: ${concept}. The image should be suitable for conversion to a 3D Gaussian Splat environment.`;
    
    console.log('📝 [GEMINI] Image prompt:', imagePrompt);

    const result = await model.generateContent(imagePrompt);
    const response = await result.response;
    
    console.log('📦 [GEMINI] Response received');

    let imageUrl = '';
    const text = response.text();
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        const partAny = part as any;
        if (typeof partAny.imageUrl === 'string') {
          imageUrl = partAny.imageUrl;
          console.log('✅ [GEMINI] Image URL received:', imageUrl);
          break;
        }
      }
    }
    
    if (!imageUrl && text) {
      const urlMatch = text.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp)/i);
      if (urlMatch) {
        imageUrl = urlMatch[0];
        console.log('✅ [GEMINI] Image URL extracted from text:', imageUrl);
      }
    }

    if (!imageUrl) {
      throw new Error('No image URL found in Gemini response');
    }

    return imageUrl;
  } catch (error: any) {
    console.error('❌ [GEMINI] Error generating image:', error);
    throw error;
  }
}
