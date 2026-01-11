/**
 * Convert image to 3D Gaussian Splat using @theworldlabs Marble API
 * 
 * Marble API converts images to 3D Gaussian Splats (.spz format)
 * Documentation: Check @theworldlabs documentation for API details
 */

const MARBLE_API_KEY = import.meta.env.VITE_MARBLE_API_KEY || '06XjKizwFxHRPaaUrTg1bmPtPql3QMhw';
// Use local proxy server to avoid CORS issues
// If proxy not running, falls back to direct API (will fail with CORS)
const MARBLE_API_URL = import.meta.env.VITE_MARBLE_PROXY_URL || 'http://localhost:3001/api/marble/convert';
const MARBLE_DIRECT_URL = import.meta.env.VITE_MARBLE_API_URL || 'https://api.theworldlabs.com/v1/marble/convert';

// Note: Check @theworldlabs documentation for exact API endpoint and format
// API docs: https://worldlabs-api-reference.mintlify.app/api

export async function convertImageToSplat(imageUrlOrData: string, concept?: string): Promise<string> {
  try {
    console.log('🔄 [MARBLE] Starting conversion - Image:', imageUrlOrData.substring(0, 50) + '...');
    console.log('💰 [COST] Marble API call initiated - this will charge your account');

    if (!MARBLE_API_KEY) {
      throw new Error('VITE_MARBLE_API_KEY not found. Please add it to your .env file.');
    }

    // Step 1: Handle blob URLs, data URIs, or regular URLs
    let imageFile: File | Blob | null = null;
    let imageUrl: string | null = null;
    
    if (imageUrlOrData.startsWith('blob:')) {
      // Blob URL - fetch and convert to file
      console.log('🔄 [MARBLE] Converting blob URL to file...');
      const blobResponse = await fetch(imageUrlOrData);
      const blob = await blobResponse.blob();
      imageFile = new File([blob], 'image.png', { type: blob.type || 'image/png' });
      console.log('✅ [MARBLE] Blob converted to file');
    } else if (imageUrlOrData.startsWith('data:')) {
      // Data URI (base64) - convert to file
      console.log('🔄 [MARBLE] Converting data URI to file...');
      const [header, base64] = imageUrlOrData.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      imageFile = new File([byteArray], 'image.png', { type: mimeType });
      console.log('✅ [MARBLE] Data URI converted to file');
    } else {
      // Regular URL - verify it's accessible
      console.log('🔄 [MARBLE] Verifying image URL accessibility...');
      try {
        const imageResponse = await fetch(imageUrlOrData, { method: 'HEAD' });
        if (imageResponse.ok) {
          imageUrl = imageUrlOrData;
          console.log('✅ [MARBLE] Image URL is accessible');
        } else {
          throw new Error(`Image URL not accessible: ${imageResponse.status}`);
        }
      } catch (e) {
        // If HEAD fails, try fetching the image and converting to file
        console.log('⚠️ [MARBLE] HEAD failed, fetching image to convert to file...');
        const imageResponse = await fetch(imageUrlOrData);
        const blob = await imageResponse.blob();
        imageFile = new File([blob], 'image.png', { type: blob.type || 'image/png' });
        console.log('✅ [MARBLE] Image fetched and converted to file');
      }
    }

    // Step 2: Call Marble API to convert image to .spz
    console.log('🔄 [MARBLE] Calling Marble API...');
    const formData = new FormData();
    
    if (imageFile) {
      // Send image file directly (preferred method)
      // Marble API might accept: 'image', 'file', 'image_file', or 'image_data'
      formData.append('image', imageFile);
      console.log('📤 [MARBLE] Sending image file directly to Marble API');
      console.log('📦 [MARBLE] File size:', imageFile.size, 'bytes, type:', imageFile.type);
    } else if (imageUrl) {
      // Send image URL (for publicly accessible URLs)
      formData.append('image_url', imageUrl);
      console.log('📤 [MARBLE] Sending image URL to Marble API:', imageUrl);
    } else {
      throw new Error('No valid image file or URL to send to Marble');
    }
    
    // Add concept if provided (for world generation prompt)
    if (concept) {
      formData.append('concept', concept);
      console.log('📝 [MARBLE] Concept for world generation:', concept);
    }
    
    // Use proxy server to avoid CORS
    // Proxy runs on localhost:3001 and handles the full Marble API workflow
    const PROXY_URL = 'http://localhost:3001/api/marble/convert';
    
    console.log('🔄 [MARBLE] Using proxy server (http://localhost:3001) to avoid CORS...');
    console.log('💡 [MARBLE] Make sure proxy server is running: node server.js');
    console.log('⏳ [MARBLE] World generation takes ~5 minutes - please wait...');
    
    let response: Response;
    try {
      // Proxy handles the full workflow: upload media asset → generate world → poll → return splat URL
      response = await fetch(PROXY_URL, {
        method: 'POST',
        body: formData
      });
    } catch (fetchError: any) {
      if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('CORS')) {
        console.error('❌ [MARBLE] CORS error or proxy not running');
        console.error('💡 [MARBLE] Solution: Start the proxy server: node server.js');
        throw new Error('Marble API requires backend proxy. Please run: node server.js');
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [MARBLE] API error response:', errorText);
      console.error('❌ [MARBLE] Status:', response.status, response.statusText);
      throw new Error(`Marble API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📦 [MARBLE] API response:', data);
    
    // Proxy server returns:
    // {
    //   "splat_url": "https://...",
    //   "world_id": "...",
    //   "operation_id": "..."
    // }
    
    if (data.splat_url) {
      console.log('✅ [MARBLE] Splat URL received:', data.splat_url);
      console.log('🌍 [MARBLE] World ID:', data.world_id);
      console.log('💰 [COST] Marble conversion completed successfully');
      return data.splat_url;
    }

    console.error('❌ [MARBLE] Unexpected response format:', data);
    throw new Error('Unexpected response format from Marble API proxy. Expected splat_url in response.');

  } catch (error) {
    console.error('❌ [MARBLE] Error converting image to splat:', error);
    console.error('💰 [COST] Marble API call failed - check if you were charged');
    throw error;
  }
}

async function pollMarbleJob(jobId: string): Promise<string> {
  const maxAttempts = 60; // 5 minutes max
  let attempts = 0;

  console.log(`⏳ [MARBLE] Polling job ${jobId} (max ${maxAttempts} attempts, 5s intervals)`);

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds

    const statusUrl = `${MARBLE_API_URL.replace('/convert', '')}/status/${jobId}`;
    console.log(`🔄 [MARBLE] Polling attempt ${attempts + 1}/${maxAttempts}: ${statusUrl}`);

    const response = await fetch(statusUrl, {
      headers: {
        'Authorization': `Bearer ${MARBLE_API_KEY}`,
      }
    });

    if (!response.ok) {
      console.error(`❌ [MARBLE] Status check failed: ${response.status}`);
      throw new Error(`Failed to check Marble job status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`📊 [MARBLE] Job status:`, data);

    if (data.status === 'completed') {
      if (data.splat_url) {
        console.log('✅ [MARBLE] Job completed! Splat URL:', data.splat_url);
        console.log('💰 [COST] Marble conversion completed successfully');
        return data.splat_url;
      }
      if (data.splat_data) {
        console.log('✅ [MARBLE] Job completed! Splat data received (base64)');
        console.log('💰 [COST] Marble conversion completed successfully');
        const blob = await base64ToBlob(data.splat_data, 'application/octet-stream');
        return URL.createObjectURL(blob);
      }
      throw new Error('Job completed but no splat_url or splat_data found');
    }

    if (data.status === 'failed') {
      console.error('❌ [MARBLE] Job failed:', data.error || 'Unknown error');
      console.error('💰 [COST] Marble conversion failed - check if you were charged');
      throw new Error(`Marble conversion failed: ${data.error || 'Unknown error'}`);
    }

    // Status is 'processing' or 'pending', continue polling
    console.log(`⏳ [MARBLE] Job status: ${data.status}, continuing to poll...`);
    attempts++;
  }

  console.error('❌ [MARBLE] Polling timeout after 5 minutes');
  console.error('💰 [COST] Marble conversion timeout - check job status manually');
  throw new Error('Marble conversion timeout after 5 minutes');
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
