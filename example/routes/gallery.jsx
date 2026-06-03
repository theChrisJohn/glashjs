// Uses the zero-config <Image> -> emits <picture> with AVIF/WebP sources.
import { Image } from '../../src/components/image.mjs';

export const title = 'glashjs — gallery';

// SEO metadata -> rendered into <head> (description, OG, Twitter cards).
export const metadata = {
  title: 'glashjs gallery',
  description: 'A gallery rendered with the glashjs Image component.',
  openGraph: { image: '/photo.png', type: 'website' },
};

export default function Gallery() {
  return (
    <div>
      <h1>Gallery</h1>
      <Image src="/photo.png" alt="A photo" width={1200} height={630} />
    </div>
  );
}
