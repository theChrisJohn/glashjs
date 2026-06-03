// Uses <Video> -> emits <video> with AV1/WebM source + mp4 fallback + poster.
import { Video } from '../../src/components/video.mjs';

export const title = 'glashjs — clip';

export default function Clip() {
  return (
    <div>
      <h1>Clip</h1>
      <Video src="/demo.mp4" width={1280} height={720} />
    </div>
  );
}
