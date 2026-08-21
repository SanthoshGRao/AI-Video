import { registerRoot, Composition } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(() => (
  <Composition
    id="export"
    component={RemotionRoot}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1920}
  />
));
