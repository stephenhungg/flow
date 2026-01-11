import { GaussianSplatViewer } from '../components/GaussianSplatViewer';

export const SplatTest = () => {
  // You can use:
  // 1. A local file in public/scenes/your-scene.ply
  // 2. A URL to a hosted .ply file
  // 3. Download samples from: https://projects.markkellogg.org/downloads/gaussian_splat_data.zip

  // Example URLs (replace with your own):
  const splatUrl = '/scenes/test.ply'; // Local file path
  // const splatUrl = 'https://your-cdn.com/scene.ply'; // Or remote URL

  return (
    <div className="w-full h-screen bg-black">
      <GaussianSplatViewer
        splatUrl={splatUrl}
        onLoaded={() => console.log('Splat loaded!')}
      />
    </div>
  );
};
