import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 5173;
const URL = `http://localhost:${PORT}`;

async function generateOGImage() {
  console.log('🚀 Starting OG image generation...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport to OG image dimensions (1200x630)
    await page.setViewport({
      width: 1200,
      height: 630,
      deviceScaleFactor: 2 // Higher DPI for better quality
    });
    
    console.log(`📸 Navigating to ${URL}...`);
    await page.goto(URL, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Wait a bit for any animations to settle
    await page.waitForTimeout(2000);
    
    // Take screenshot
    const screenshotPath = join(__dirname, '../public/og-image.png');
    console.log('📷 Taking screenshot...');
    await page.screenshot({
      path: screenshotPath,
      type: 'png',
      fullPage: false,
      clip: {
        x: 0,
        y: 0,
        width: 1200,
        height: 630
      }
    });
    
    console.log(`✅ OG image saved to ${screenshotPath}`);
    
  } catch (error) {
    console.error('❌ Error generating OG image:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

generateOGImage();

