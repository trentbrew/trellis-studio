import { Composition } from "remotion"
import { MainVideo } from "./Scene"

export function RemotionRoot() {
  return (
    <>
      <Composition id="MainVideo" component={MainVideo} durationInFrames={180} fps={30} width={1920} height={1080} />
    </>
  )
}
